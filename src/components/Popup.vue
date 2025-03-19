<template>
    <div class="side-panel-container">        
        <div class="header bg-primary-800 w-full h-20">
            <div class="flex justify-content-between align-items-center">
                <a :href="library_url" target="_blank">
                    <img src="/icons/iCognitionLogo.png" alt="iCognition Logo" width="150px" class="m-2"/>
                </a>
                <div class="pi pi-sign-out text-white mr-4 flex align-items-center" v-if="user" @click="handleSignOut"></div>
            </div>
        </div>
        
        <div class="flex flex-column">
            <div v-if="status.state === AppStatusEnum.INITIALIZING.state" class="m-2 p-2">
                <ProgressBar mode="indeterminate"></ProgressBar>
                <p>{{ statusMessage }}</p>
            </div>
            
            <div v-if="status.state === AppStatusEnum.PROCESSING.state && progressPercent > 0 && progressPercent < 100" class="message_container flex align-items-center justify-content-center p-2 m-2">
                <div class="w-full px-3">
                    <ProgressBar :value="progressPercent" class="mb-2"></ProgressBar>
                    <p class="text-center">{{ AppStatusEnum.PROCESSING.message }}</p>
                </div>
            </div>
           
            <div v-if="status.state === AppStatusEnum.UNAUTHENTICATED.state" class="button_container flex align-items-center justify-content-center m-2 p-2">
                <GoogleLoginButton></GoogleLoginButton>
            </div>

            <div v-if="status.state === AppStatusEnum.READY.state && (!chat_messages || chat_messages.length === 0)" class="flex flex-column align-items-center justify-content-center m-2 p-4">
                <p class="text-center mb-2">No analysis found for this page</p>
                <Button @click="handleBookmark" label="Analyze This Page" icon="pi pi-search" class="p-button-primary"></Button>
            </div>
        </div>

        <!-- Chat interface container -->
        <div v-if="chat_messages && chat_messages.length > 0" class="chat-interface-container">
            <div class="page-info p-2 bg-primary-50">
                <div class="flex align-items-center justify-content-between">
                    <span class="text-sm text-primary-800">{{ getCurrentPageTitle() }}</span>
                    <Button @click="clearCurrentChat" icon="pi pi-trash" class="p-button-text p-button-sm p-button-danger"></Button>
                </div>
            </div>
            <DocSummary 
                :chat="chat_messages" 
                @remove-chat-item="handleRemoveChatItem" 
                @add-chat-item="handleAddChatItem">
            </DocSummary>
        </div>

        <!-- Ask input section - always visible -->
        <div id="ask" class="ask-input" v-if="status.state === AppStatusEnum.READY.state || status.state === AppStatusEnum.DOCUMENT_READY.state">               
            <div ref="ask_question_input" class="flex gap-2">
                <div class="autocomplete-container flex-grow-1">
                    <AutoComplete 
                        v-model="selectedQuestion"
                        :suggestions="filteredQuestions"
                        @complete="searchQuestions"
                        @keyup.enter="handleAsk"
                        class="w-full"
                        placeholder="Ask about this document..."
                        :dropdown="true"
                        :panelStyle="{ width: '100%' }"
                        :pt="{
                            root: { class: 'w-full' },
                            panel: { class: 'surface-ground border-1 border-round-md shadow-2' },
                            input: { class: 'text-sm w-full' }
                        }"
                    >
                        <template #option="slotProps">
                            <div class="suggestion-item">
                                {{ slotProps.option }}
                            </div>
                        </template>
                    </AutoComplete>
                </div>
                <Button @click="handleAsk" 
                        icon="pi pi-send"
                        class="p-button-rounded" />
            </div>
        </div>

        <div v-if="status.severity === AppStatusEnum.ERROR.severity" class="m-2 p-2 flex align-items-center justify-content-center">
            <Message id="status-message" 
                    :severity="status.severity" 
                    class="w-full" 
                    :closable="false">
                {{ status.message }}
            </Message>
        </div>
        
        <div v-if="debug_mode" class="debug surface-ground p-2 border-top-1 border-primary-100">
            <p class="text-sm text-600 mb-1">Status: {{ status.state }}</p>
            <p class="text-sm text-600 mb-1">Status Message: {{ statusMessage }}</p>
            <p class="text-sm text-600 mb-1">Document: {{ doc?.id }}</p>
            <p class="text-sm text-600 mb-1">User: {{ user?.uid }}</p>
            <p class="text-sm text-600">Progress Percent: {{ progressPercent }}</p>
        </div>
    </div>
</template>
<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { cleanUrl, CommunicationEnum } from '../../public/js/composables/utils.js';
import Button from 'primevue/button';
import DocSummary from '../../public/js/components/DocSummary.vue';
import GoogleLoginButton from '../../public/js/components/GoogleLoginButton.vue';
import ProgressBar from 'primevue/progressbar';
import Message from 'primevue/message';
import useAuth from '../../public/js/composables/useAuth.js';
import AutoComplete from 'primevue/autocomplete';

const { handleSignOut } = useAuth()

const AppStatusEnum = {
    INITIALIZING: {
        state: 'initializing',
        message: 'Starting service...',
        severity: 'info'
    },
    SERVER_DOWN: {
        state: 'server_down',
        message: 'Error connecting to server',
        severity: 'error'
    },
    UNAUTHENTICATED: {
        state: 'unauthenticated',
        message: null,
        severity: 'info'
    },
    READY: {
        state: 'ready',
        message: null,
        severity: 'info'
    },
    PROCESSING: {
        state: 'processing',
        message: 'Processing document...',
        severity: 'info'
    },
    ERROR: {
        state: 'error',
        message: null,
        severity: 'error'
    },
    DOCUMENT_READY: {
        state: 'document_ready',
        message: null,
        severity: 'success'
    }
}

const status = ref(AppStatusEnum.INITIALIZING)
const statusMessage = ref(AppStatusEnum.INITIALIZING.message)
const bookmark = ref(null)
const bookmarks = ref([])
const active_tab = ref(null)
const doc = ref(null)
const chat_messages = ref(null)
const debug_mode = ref(true) // TODO: Remove this before production
const library_url = ref(import.meta.env.VITE_ICOGNITION_APP_URL || 'https://app.icognition.ai')
const progressPercent = ref(5)
const user = ref(null)
const suggestedQuestions = ref(['What is the name of the company, this is a long question, very long question that I am asking?', 'What is the name of the product?', 'What is the name of the service?', 'What is the name of the person?', 'What is the name of the place?'])
const selectedQuestion = ref('')
const filteredQuestions = ref([])

// Store chats by URL
const chatsByUrl = ref({});
// Store bookmarks by URL
const bookmarksByUrl = ref({});
// Store document IDs by URL
const documentIdsByUrl = ref({});

onMounted(async () => {
    console.log('SidePanel component mounted');
    
    // Check if server is running
    chrome.runtime.sendMessage({ name: 'server-is' }).then((response) => {
        console.log('Status -> server-is', response)
        if (response.status === 'up') {
            // If server is up, check user state
            chrome.storage.session.get(["session_user"]).then((session) => {
                if (session.session_user) {
                    status.value = AppStatusEnum.READY
                    statusMessage.value = AppStatusEnum.READY.message
                    user.value = session.session_user
                    console.log('User authenticated, status:', status.value.state);
                } else {
                    status.value = AppStatusEnum.UNAUTHENTICATED
                    statusMessage.value = AppStatusEnum.UNAUTHENTICATED.message
                    console.log('User not authenticated, status:', status.value.state);
                }
            })
        } else {
            status.value = AppStatusEnum.SERVER_DOWN
            console.log('Server is down, status:', status.value.state);
        }
    })

    // Set up tab change listeners
    window.addEventListener('tab-changed', (event) => {
        console.log('Tab change event received:', event.detail);
        handleTabChange(event.detail);
    });
    
    // Set up tab change listeners
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        console.log('Tab activated event fired with tabId:', activeInfo.tabId);
        const tab = await chrome.tabs.get(activeInfo.tabId);
        console.log('Retrieved tab info:', tab);
        if (tab && tab.url) {
            console.log('Dispatching tab-changed event for URL:', tab.url);
            window.dispatchEvent(new CustomEvent('tab-changed', { detail: tab }));
        }
    });
    
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        console.log('Tab updated event fired:', { tabId, changeInfo, url: tab.url });
        if (changeInfo.status === 'complete' && tab.url) {
            console.log('Tab load complete, dispatching tab-changed event for URL:', tab.url);
            window.dispatchEvent(new CustomEvent('tab-changed', { detail: tab }));
        }
    });
    
    // Initial load - get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        console.log('Initial tab query result:', tabs);
        if (tabs && tabs[0]) {
            console.log('Setting initial tab:', tabs[0]);
            active_tab.value = tabs[0];
            if (user.value) {
                searchBookmarksByUrl(tabs[0].url);
            }
        }
    });
});

const handleTabChange = (tab) => {
    console.log('handleTabChange called with tab:', tab);
    
    if (!tab || !tab.url) {
        console.log('handleTabChange: Invalid tab or missing URL');
        return;
    }
    
    console.log('Current status before tab change:', status.value.state);
    console.log('Current active_tab:', active_tab.value?.url);
    
    // Save current chat if it exists
    if (active_tab.value && active_tab.value.url && chat_messages.value) {
        const cleanedUrl = cleanUrl(active_tab.value.url);
        console.log('Saving chat for URL:', cleanedUrl);
        chatsByUrl.value[cleanedUrl] = [...chat_messages.value];
        
        if (bookmark.value) {
            bookmarksByUrl.value[cleanedUrl] = {...bookmark.value};
            console.log('Saving bookmark for URL:', cleanedUrl);
        }
        
        if (doc.value) {
            documentIdsByUrl.value[cleanedUrl] = doc.value.id;
            console.log('Saving document ID for URL:', cleanedUrl);
        }
    }
    
    // Update active tab
    active_tab.value = tab;
    const currentUrl = cleanUrl(tab.url);
    console.log('New active tab URL (cleaned):', currentUrl);
    
    // Reset all states
    chat_messages.value = null;
    bookmark.value = null;
    doc.value = null;
    progressPercent.value = 5;
    status.value = AppStatusEnum.READY; // Reset to READY state
    statusMessage.value = null; // Clear any error messages
    console.log('Reset chat, bookmark, and doc');
    
    // Check if we have a saved chat for this URL
    if (chatsByUrl.value[currentUrl] && chatsByUrl.value[currentUrl].length > 0) {
        console.log('Found saved chat for URL:', currentUrl);
        chat_messages.value = chatsByUrl.value[currentUrl];
        bookmark.value = bookmarksByUrl.value[currentUrl] || null;
        
        if (documentIdsByUrl.value[currentUrl]) {
            status.value = AppStatusEnum.DOCUMENT_READY;
            console.log('Setting status to DOCUMENT_READY');
        }
    } else if (user.value) {
        // If no saved chat but user is logged in, check for bookmarks
        status.value = AppStatusEnum.READY;
        console.log('No saved chat, user logged in, setting status to READY');
        console.log('Searching bookmarks for URL:', currentUrl);
        searchBookmarksByUrl(currentUrl);
    } else {
        // If no user is logged in, set status to UNAUTHENTICATED
        status.value = AppStatusEnum.UNAUTHENTICATED;
        console.log('No user logged in, setting status to UNAUTHENTICATED');
    }
    
    console.log('Final status after tab change:', status.value.state);
}

watch(user, (after, before) => {
    if (after) {
        console.log('User logged in! ', user.value)
        status.value = AppStatusEnum.READY
        if (active_tab.value) {
            searchBookmarksByUrl(active_tab.value.url);
        }
    } else {
        console.log('User logged out!')
        status.value = AppStatusEnum.UNAUTHENTICATED
        chrome.storage.local.remove('bookmarks')
        bookmarks.value = []
        // Clear all saved chats when user logs out
        chatsByUrl.value = {};
        bookmarksByUrl.value = {};
        documentIdsByUrl.value = {};
    }
});

const searchBookmarksByUrl = async (url) => {
    console.log('searchBookmarksByUrl called with URL:', url);
    
    if (!url) {
        console.log('searchBookmarksByUrl -> url is null')
        return
    }
    
    if (!user.value) {
        console.log('searchBookmarksByUrl -> user not authenticated')
        return
    }

    const cleanedUrl = cleanUrl(url);
    console.log('searchBookmarksByUrl cleaned URL:', cleanedUrl);
    
    // Check if we already have a chat for this URL
    if (chatsByUrl.value[cleanedUrl] && chatsByUrl.value[cleanedUrl].length > 0) {
        console.log('Found chat in memory for URL:', cleanedUrl);
        chat_messages.value = chatsByUrl.value[cleanedUrl];
        bookmark.value = bookmarksByUrl.value[cleanedUrl] || null;
        status.value = AppStatusEnum.DOCUMENT_READY;
        console.log('Setting status to DOCUMENT_READY (found chat in memory)');
        return;
    }

    const value = await chrome.storage.local.get(["bookmarks"]);
    console.log('Got bookmarks from storage:', value.bookmarks ? value.bookmarks.length : 0);

    if (value.bookmarks) {
        value.bookmarks = value.bookmarks.filter(bookmark => bookmark != null && bookmark !== undefined);
        console.log('Filtered bookmarks count:', value.bookmarks.length);
    }

    if (value.bookmarks) {
        let found;
        try {
            found = value.bookmarks.find(bookmark => bookmark.url == cleanedUrl);
            console.log('Bookmark found for URL:', found ? 'Yes' : 'No');

            if (!found) {
                console.log('No bookmarks found in local storage for URL:', cleanedUrl);
                // Explicitly set status to READY to show the Analyze button
                status.value = AppStatusEnum.READY;
                console.log('Setting status to READY (no bookmark found)');
                return;
            } else {
                status.value = AppStatusEnum.READY;
                bookmark.value = found;
                console.log('Found bookmark:', bookmark.value);
                console.log('Fetching chat for document ID:', bookmark.value.document_id);
                fetchChat(bookmark.value.document_id);
                return;
            }

        } catch (error) {
            console.error('Error searching bookmarks by URL:', error);
            handleError('Error searching bookmarks');
            return;
        }
    } else {
        // No bookmarks at all, set status to READY to show the Analyze button
        status.value = AppStatusEnum.READY;
        console.log('No bookmarks in storage, setting status to READY');
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('onMessage:', request.name)
    
    if (request.name === CommunicationEnum.NEW_DOC) {
        doc.value = request.data
        status.value = AppStatusEnum.DOCUMENT_READY
        console.log('New document, status:', status.value.state)
        
        // Save document ID for current URL
        if (active_tab.value && active_tab.value.url) {
            documentIdsByUrl.value[cleanUrl(active_tab.value.url)] = doc.value.id;
        }
    }

    if (request.name === CommunicationEnum.CHAT_READY) {
        console.log('Chat ready -> request:', request)
        // Make sure we're setting chat_messages to an array
        if (Array.isArray(request.data)) {
            chat_messages.value = request.data;
            progressPercent.value = 100;
        } else {
            // If it's not an array, create an array with the single item
            chat_messages.value = [request.data];
            console.log('Chat ready -> converted non-array to array:', chat_messages.value);
        }
        
        status.value = AppStatusEnum.DOCUMENT_READY
        console.log('Chat ready -> chat_messages.value:', chat_messages.value)
        
        // Save chat for current URL
        if (active_tab.value && active_tab.value.url) {
            chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
        }
        
        // Force a refresh of the DocSummary component
        nextTick(() => {
            console.log('Chat ready -> nextTick, chat_messages:', chat_messages.value);
        });
    }

    if (request.name === CommunicationEnum.ERROR) {
        console.log('Error -> request:', request)
        handleError('Error fetching chat messages: ' + request.data);
    }

    if (request.name === CommunicationEnum.CHAT_MESSAGE) {
        console.log('Chat message -> request:', request)
        const newChatMessage = JSON.parse(request.data);
        console.log('New chat message:', newChatMessage)
        
        // Add the new chat message to the existing messages
        if (chat_messages.value) {
            chat_messages.value.push(newChatMessage);
        } else {
            chat_messages.value = [newChatMessage];
        }
        
        // Save updated chat for current URL
        if (active_tab.value && active_tab.value.url) {
            chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
        }
        
        // If we have a document, update the status to DOCUMENT_READY
        if (doc.value) {
            status.value = AppStatusEnum.DOCUMENT_READY
        }
    }

    if (request.name === CommunicationEnum.PROGRESS_PERCENTAGE) {
        if (status.value !== AppStatusEnum.DOCUMENT_READY && doc.value == null && progressPercent.value < 99) {
            status.value = AppStatusEnum.PROCESSING
            progressPercent.value = Math.min(99, progressPercent.value + request.data)
            console.log('Progress percentage:', progressPercent.value)
        }
    }
    
    if (request.name === 'error-bookmarking') {
        console.log('error-bookmarking -> request', request)
        doc.value = null;
        handleError(request.data);
        sendResponse({ message: 'bookmark-page received' })
    }

    if (request.name === 'question-answers-ready') {
        console.log('document-ready -> request', request)
        doc.value = request.data
        status.value = AppStatusEnum.READY
        sendResponse({ message: 'document-ready recived' })
    }

    if (request.name === CommunicationEnum.SUGGESTED_QUESTIONS) {
        console.log('Suggested questions received:', request.data);
        suggestedQuestions.value = request.data;
        // Initialize filtered questions with all suggestions
        filteredQuestions.value = [...request.data];
    }
})

chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        console.log(
            `Storage key "${key}" in namespace "${namespace}" changed.`,
            `Old value was "${oldValue}", new value is "${newValue}".`
        );
        if (key === 'bookmarks' && namespace === 'local') {
            if (newValue === undefined) {
                bookmarks.value = []
            } else {
                bookmarks.value = newValue

                if (active_tab.value) {
                    console.log('Update Bookmarks -> active_tab:', active_tab.value)
                    searchBookmarksByUrl(active_tab.value.url)
                } else {
                   //Set status to ready
                   status.value = AppStatusEnum.READY
                }
            }
        }
        
        if (key === 'session_user' && namespace === 'session') {
            user.value = newValue;
        }
    }
});

const handleBookmark = async () => {
    status.value = AppStatusEnum.PROCESSING
    statusMessage.value = AppStatusEnum.PROCESSING.message
    progressPercent.value = 5;

    chrome.runtime.sendMessage({name: 'bookmark-page', tab: active_tab.value}).then((response) => {
        console.log('handleBookmark -> response:', response)

        if (response.status === 201) {
            bookmark.value = response.content
            status.value = AppStatusEnum.PROCESSING
            
            // Save bookmark for current URL
            if (active_tab.value && active_tab.value.url) {
                bookmarksByUrl.value[cleanUrl(active_tab.value.url)] = {...bookmark.value};
            }
        } else if (response.status === 200) {
            bookmark.value = response.content
            
            // Save bookmark for current URL
            if (active_tab.value && active_tab.value.url) {
                bookmarksByUrl.value[cleanUrl(active_tab.value.url)] = {...bookmark.value};
            }
            
            //If the document is not ready, fetch the document
            //This is to ensure that the document is fetched in case the backend didn't send the document via websocket
            if (chat_messages.value == null) {
                fetchChat(bookmark.value.document_id)
            }
        } else {
            //If the status is not server down, that is the reason for the error
            if (status.value.state !== AppStatusEnum.SERVER_DOWN.state) {
                const errorMessage = response.content.detail || 'Error creating a chat';
                handleError(errorMessage);
            }
        }
    })
}

const fetchChat = async (document_id) => {
    console.log('fetchChat -> document_id:', document_id)
    chrome.runtime.sendMessage({ 
        name: CommunicationEnum.FETCH_CHAT, 
        document_id: document_id 
    }).then((chatResponse) => {
        console.log('fetch-chat response:', chatResponse)
        if (chatResponse && chatResponse.success && chatResponse.chat) {
            chat_messages.value = chatResponse.chat;
            status.value = AppStatusEnum.DOCUMENT_READY;
            
            // Save chat for current URL
            if (active_tab.value && active_tab.value.url) {
                chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
                documentIdsByUrl.value[cleanUrl(active_tab.value.url)] = document_id;
            }
        } else {
            console.error('Failed to fetch chat messages:', chatResponse?.error || 'Unknown error');
            handleError('Failed to fetch chat messages');
        }
    }).catch(error => {
        console.error('Error fetching chat messages:', error);
        handleError('Error fetching chat messages');
    });
}

// Add these methods to handle the events
const handleRemoveChatItem = (uuid) => {
    if (chat_messages.value) {
        chat_messages.value = chat_messages.value.filter(item => item.id !== uuid);
        
        // Update saved chat for current URL
        if (active_tab.value && active_tab.value.url) {
            chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
        }
    }
}

const handleAddChatItem = (newItem) => {
    if (chat_messages.value) {
        chat_messages.value.push(newItem);
    } else {
        chat_messages.value = [newItem];
    }
    
    // Update saved chat for current URL
    if (active_tab.value && active_tab.value.url) {
        chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
    }
}

const getCurrentPageTitle = () => {
    if (active_tab.value && active_tab.value.title) {
        return active_tab.value.title.length > 40 
            ? active_tab.value.title.substring(0, 40) + '...' 
            : active_tab.value.title;
    }
    return 'Current Page';
}

const clearCurrentChat = () => {
    if (active_tab.value && active_tab.value.url) {
        const currentUrl = cleanUrl(active_tab.value.url);
        
        // Clear chat for current URL
        delete chatsByUrl.value[currentUrl];
        delete bookmarksByUrl.value[currentUrl];
        delete documentIdsByUrl.value[currentUrl];
        
        // Reset current state
        chat_messages.value = null;
        bookmark.value = null;
        doc.value = null;
        status.value = AppStatusEnum.READY;
    }
}

function handleError(errorMessage) {
  // Set error status and messages
  status.value = {
    ...AppStatusEnum.ERROR,
    message: errorMessage  // Set the message in the status object
  };
  statusMessage.value = errorMessage;  // Also set the statusMessage for consistency
  
  // Clear chat messages to reset UI
  chat_messages.value = null;
  
  // Clear from URL cache if needed
  if (active_tab.value && active_tab.value.url) {
    const currentUrl = cleanUrl(active_tab.value.url);
    delete chatsByUrl.value[currentUrl];
  }
  
  console.error('Error:', errorMessage);
}

const searchQuestions = (event) => {
    setTimeout(() => {
        if (!event.query.trim().length) {
            filteredQuestions.value = [...suggestedQuestions.value];
        }
        else {
            filteredQuestions.value = suggestedQuestions.value.filter((item) => {
                return item.toLowerCase().includes(event.query.toLowerCase());
            });
        }
        console.log('Filtered questions:', filteredQuestions.value);
    }, 250);
};

const handleAsk = () => {
    if (!selectedQuestion.value) return;
    
    console.log('handleAsk -> question:', selectedQuestion.value);
    
    // Try to get document_id from the first chat message
    let document_id = null;
    if (chat_messages.value && chat_messages.value.length > 0) {
        document_id = chat_messages.value[0].chat_id;
    }
    
    if (!document_id) {
        console.error('No document_id found in chat messages');
        return;
    }
    
    const payload = {
        question: selectedQuestion.value,
        document_id: document_id
    };
    
    console.log('handleAsk -> payload:', payload);
    
    chrome.runtime.sendMessage({ 
        name: CommunicationEnum.ASK_QUESTION, 
        payload: payload 
    }).then((response) => {
        console.log('handleAsk -> response:', response);
        if (response && response.answer) {
            handleAddChatItem(response.answer);
        }
        selectedQuestion.value = ''; // Clear the input after asking
    }).catch(error => {
        console.error('Error asking question:', error);
        handleError('Error asking question');
    });
};
</script>

<style scoped>
.side-panel-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
}

.header {
    border-bottom: 1px solid #e0e0e0;
}

.chat-interface-container {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.page-info {
    border-bottom: 1px solid #e0e0e0;
}

.message_container {
    margin: 10px;
}

.button_container {
    margin: 10px;
}

.debug {
    position: fixed;
    bottom: 60px;
    left: 0;
    right: 0;
    background-color: var(--surface-ground);
    border-top: 1px solid var(--surface-border);
    z-index: 1000;
    max-height: 80px;
    overflow-y: auto;
    font-family: var(--font-family);
}

.debug p {
    margin: 0.25rem 0;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    color: var(--text-color-secondary);
}

/* Update ask-input z-index to ensure proper layering */
.ask-input {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: var(--surface-card);
    padding: 0.5rem;
    border-top: 1px solid var(--surface-border);
    height: 60px;
    z-index: 1001;
}

/* Adjust scrollbar height to account for debug panel */
:deep(.custom-scrollbar) {
    height: calc(100vh - 250px);
}

.mb-2 {
    margin-bottom: 0.5rem;
}

.text-sm {
    font-size: 0.875rem;
}

.text-primary-800 {
    color: #1e3a8a;
}

.bg-primary-50 {
    background-color: #f0f7ff;
}

/* Add these styles to improve chat display */
:deep(.chat-message) {
    max-width: 95% !important;
    width: 95% !important;
    margin-left: auto !important;
    margin-right: auto !important;
}

:deep(.chat-message p) {
    font-size: 0.9rem !important;
    line-height: 1.4 !important;
}

:deep(.chat-message-content) {
    max-width: 95% !important;
    width: 95% !important;
}

:deep(.max-w-25) {
    max-width: 95% !important;
}

:deep(.p-card-content) {
    padding: 0.75rem !important;
}

:deep(.p-card) {
    margin-bottom: 0.75rem !important;
}

:deep(.p-inputtext) {
    font-size: 0.9rem !important;
}

:deep(.p-autocomplete) {
    width: 100%;
    display: block;
}

:deep(.p-autocomplete-panel) {
    position: absolute;
    max-height: 300px !important;
    overflow-y: auto;
    width: 100% !important;
    left: 0 !important;
    right: 0 !important;
    margin: 0 !important;
    box-sizing: border-box !important;
}

:deep(.p-autocomplete-items) {
    padding: 0 !important;
    width: 100% !important;
}

:deep(.p-autocomplete-item) {
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 0.5rem 0.75rem !important;
    line-height: 1.2 !important;
    white-space: pre-wrap !important;
    word-break: break-word !important;
}

.autocomplete-container {
    position: relative;
    width: 100%;
}

.suggestion-item {
    padding: 0.5rem 0.75rem;
    line-height: 1.2;
    font-size: 0.875rem;
    color: var(--text-color);
    white-space: normal;
    word-wrap: break-word;
    border-bottom: 1px solid var(--surface-border);
}

.suggestion-item:last-child {
    border-bottom: none;
}

.suggestion-item:hover {
    background-color: var(--surface-hover);
    cursor: pointer;
}
</style>