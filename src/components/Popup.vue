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
                <div class="textarea-with-autocomplete flex-grow-1">
                    <Textarea 
                        v-model="selectedQuestion"
                        @keydown="handleKeydownInTextarea"
                        @input="handleTextareaInput"
                        @focus="handleTextareaFocus"
                        @blur="handleTextareaBlur"
                        ref="questionTextarea"
                        class="w-full min-height-textarea"
                        placeholder="Ask about this document..."
                        autoResize
                        rows="2"
                        :pt="{
                            root: { class: 'w-full' },
                            input: { class: 'text-sm w-full p-inputtext-sm' }
                        }"
                    />
                    <!-- Autocomplete dropdown - using a more robust approach -->
                    <div 
                        v-show="showAutocomplete && filteredQuestions.length > 0" 
                        class="autocomplete-dropdown"
                        @mousedown.prevent
                    >
                        <div class="debug-dropdown">
                            <span>Suggested questions ({{filteredQuestions.length}})</span>
                        </div>
                        <ul class="autocomplete-list">
                            <li 
                                v-for="(question, index) in filteredQuestions" 
                                :key="index"
                                @mousedown.prevent="selectSuggestedQuestion(question)"
                                class="autocomplete-item"
                                :class="{ 'autocomplete-item-active': index === activeIndex }"
                                :data-index="index"
                            >
                                {{ question }}
                            </li>
                        </ul>
                    </div>
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
import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue'
import { cleanUrl, CommunicationEnum } from '../../public/js/composables/utils.js';
import Button from 'primevue/button';
import DocSummary from '../../public/js/components/DocSummary.vue';
import GoogleLoginButton from '../../public/js/components/GoogleLoginButton.vue';
import ProgressBar from 'primevue/progressbar';
import Message from 'primevue/message';
import useAuth from '../../public/js/composables/useAuth.js';
import Textarea from 'primevue/textarea';

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

// Add these new refs for autocomplete functionality
const showAutocomplete = ref(false);
const activeIndex = ref(-1);
const allowBlurToHide = ref(true);
const questionTextarea = ref(null);

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

    // Add event listener for keyboard navigation
    document.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
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
            scrollChatToBottom();
        });
    }

    if (request.name === CommunicationEnum.ERROR) {
        console.log('Error -> request:', request)
        handleError('Error fetching chat messages: ' + request.data);
    }

    if (request.name === CommunicationEnum.CHAT_MESSAGE) {
        console.log('Chat message received -> request:', request);
        
        try {
            let newChatMessage;
            
            // Process different message formats
            if (typeof request.data === 'string') {
                try {
                    // Try to parse if it's a JSON string
                    newChatMessage = JSON.parse(request.data);
                } catch (e) {
                    console.error('Error parsing chat message JSON:', e);
                    return; // Skip if we can't parse
                }
            } else if (request.data && typeof request.data === 'object') {
                // If it's already an object, use it directly
                newChatMessage = request.data;
            } else {
                console.error('Invalid chat message format:', request.data);
                return; // Skip invalid format
            }
            
            console.log('Processed chat message:', newChatMessage);
            
            // Remove any existing temporary messages for this question
            if (chat_messages.value && chat_messages.value.length > 0) {
                const tempId = 'temp-question-';
                chat_messages.value = chat_messages.value.filter(msg => 
                    !msg.id || (typeof msg.id === 'string' && !msg.id.startsWith(tempId))
                );
            }
            
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
            
            // Set status to DOCUMENT_READY if not already
            status.value = AppStatusEnum.DOCUMENT_READY;
            
            // Force update and scroll to the bottom
            nextTick(() => {
                console.log('Scrolling to bottom after new message');
                scrollChatToBottom();
            });
        } catch (error) {
            console.error('Error processing chat message:', error);
        }
    }

    // Add a new case to handle direct answers from ASK_QUESTION
    if (request.name === CommunicationEnum.ASK_ANSWER) {
        console.log('Ask answer -> request:', request);
        try {
            const answer = request.answer;
            if (answer) {
                // Create a chat message format from the answer
                const newChatMessage = {
                    id: answer.id || ('msg-' + Date.now()),
                    created_at: answer.created_at || new Date().toISOString(),
                    user_id: answer.user_id || (user.value?.uid || 'system'),
                    chat_id: answer.chat_id,
                    chat_type: answer.chat_type || 'document',
                    user_prompt: answer.user_prompt,
                    event_name: answer.event_name || 'manual_message',
                    response: answer.response
                };
                
                // Add to chat messages
                if (chat_messages.value) {
                    chat_messages.value.push(newChatMessage);
                } else {
                    chat_messages.value = [newChatMessage];
                }
                
                // Save updated chat for current URL
                if (active_tab.value && active_tab.value.url) {
                    chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
                }
                
                // Set status to DOCUMENT_READY if not already
                status.value = AppStatusEnum.DOCUMENT_READY;
                
                // Scroll to the bottom after UI update
                nextTick(() => {
                    scrollChatToBottom();
                });
            }
        } catch (error) {
            console.error('Error processing ask answer:', error);
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
    
    progressPercent.value = 5;
    status.value = AppStatusEnum.PROCESSING
    statusMessage.value = AppStatusEnum.PROCESSING.message
    

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
  
  // If we have chat messages, try to add the error to the chat instead of clearing it
  if (chat_messages.value && chat_messages.value.length > 0) {
    addErrorMessageToChat(errorMessage);
  } else {
    // Clear chat messages to reset UI only if there's no existing chat
    chat_messages.value = null;
    
    // Clear from URL cache if needed
    if (active_tab.value && active_tab.value.url) {
      const currentUrl = cleanUrl(active_tab.value.url);
      delete chatsByUrl.value[currentUrl];
    }
  }
  
  console.error('Error:', errorMessage);
}

// New function to add error messages to the chat
function addErrorMessageToChat(errorMessage) {
  // Create a new error message that looks like a chat message
  const errorChatMessage = {
    id: 'error-' + Date.now(), // Create a unique ID
    created_at: new Date().toISOString(),
    user_id: 'system',
    chat_type: 'error',
    response: JSON.stringify({
      answer_for_chat: `<div class="error-message">${errorMessage}</div>`,
      status: 'Error'
    })
  };
  
  // If we already have chat messages, add this to the chat
  if (chat_messages.value && chat_messages.value.length > 0) {
    chat_messages.value.push(errorChatMessage);
    
    // Update saved chat for current URL
    if (active_tab.value && active_tab.value.url) {
      chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
    }
  } else {
    // If we don't have chat messages yet, initialize with this error
    chat_messages.value = [errorChatMessage];
    status.value = AppStatusEnum.DOCUMENT_READY; // Set status to show chat interface
    
    // Save to URL cache
    if (active_tab.value && active_tab.value.url) {
      chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
    }
  }
}

// Update handleKeydownInTextarea to be the only handler active when textarea is focused
const handleKeydownInTextarea = (event) => {
    // If autocomplete is shown, handle navigation within dropdown
    if (showAutocomplete.value && filteredQuestions.value.length > 0) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                // Stop event propagation to prevent global handler from also firing
                event.stopPropagation();
                console.log('Textarea ArrowDown pressed, current activeIndex:', activeIndex.value);
                
                if (activeIndex.value === -1 || activeIndex.value >= filteredQuestions.value.length - 1) {
                    // If no item is selected or at the end, go to first item
                    activeIndex.value = 0;
                } else {
                    // Simply increment the index
                    activeIndex.value += 1;
                }
                
                console.log('Textarea ArrowDown: new activeIndex:', activeIndex.value, 'item:', filteredQuestions.value[activeIndex.value]);
                
                // Ensure the active item is visible in the dropdown
                nextTick(() => {
                    const activeItem = document.querySelector('.autocomplete-item-active');
                    if (activeItem) {
                        activeItem.scrollIntoView({ block: 'nearest' });
                    }
                });
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                // Stop event propagation to prevent global handler from also firing
                event.stopPropagation();
                console.log('Textarea ArrowUp pressed, current activeIndex:', activeIndex.value);
                
                if (activeIndex.value <= 0) {
                    // If no item is selected or at the beginning, go to last item
                    activeIndex.value = filteredQuestions.value.length - 1;
                } else {
                    // Simply decrement the index
                    activeIndex.value -= 1;
                }
                
                console.log('Textarea ArrowUp: new activeIndex:', activeIndex.value, 'item:', filteredQuestions.value[activeIndex.value]);
                
                // Ensure the active item is visible in the dropdown
                nextTick(() => {
                    const activeItem = document.querySelector('.autocomplete-item-active');
                    if (activeItem) {
                        activeItem.scrollIntoView({ block: 'nearest' });
                    }
                });
                break;
                
            case 'Enter':
                event.preventDefault();
                event.stopPropagation();
                if (activeIndex.value !== -1) {
                    // If an item is selected in the dropdown, select it
                    selectSuggestedQuestion(filteredQuestions.value[activeIndex.value]);
                } else {
                    // If no item is selected but dropdown is open, submit the question
                    handleAsk();
                    showAutocomplete.value = false;
                }
                break;
                
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                showAutocomplete.value = false;
                break;
                
            case 'Tab':
                // Prevent default tab behavior and select current item if one is active
                if (activeIndex.value !== -1) {
                    event.preventDefault();
                    event.stopPropagation();
                    selectSuggestedQuestion(filteredQuestions.value[activeIndex.value]);
                }
                break;
        }
    } else {
        // When no dropdown is visible, Enter should submit the question
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleAsk();
        }
    }
};

// Update handleKeyDown to only handle keyboard navigation when the textarea is NOT focused
const handleKeyDown = (event) => {
    // Only handle dropdown navigation at the document level if:
    // 1. Suggestions are visible
    // 2. We have suggestions to show
    // 3. The textarea is NOT focused (this is important to avoid double-handling)
    if (!showAutocomplete.value || 
        filteredQuestions.value.length === 0 || 
        document.activeElement === questionTextarea.value?.$el?.querySelector('textarea')) {
        return;
    }
    
    console.log('Global key handler active - textarea is not focused');
    
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            console.log('Document ArrowDown pressed, current activeIndex:', activeIndex.value);
            
            if (activeIndex.value === -1 || activeIndex.value >= filteredQuestions.value.length - 1) {
                // If no item is selected or at the end, go to first item
                activeIndex.value = 0;
            } else {
                // Simply increment the index
                activeIndex.value += 1;
            }
            
            console.log('Document ArrowDown: new activeIndex:', activeIndex.value, 'item:', filteredQuestions.value[activeIndex.value]);
            break;
            
        case 'ArrowUp':
            event.preventDefault();
            console.log('Document ArrowUp pressed, current activeIndex:', activeIndex.value);
            
            if (activeIndex.value <= 0) {
                // If no item is selected or at the beginning, go to last item
                activeIndex.value = filteredQuestions.value.length - 1;
            } else {
                // Simply decrement the index
                activeIndex.value -= 1;
            }
            
            console.log('Document ArrowUp: new activeIndex:', activeIndex.value, 'item:', filteredQuestions.value[activeIndex.value]);
            break;
            
        case 'Enter':
            if (activeIndex.value !== -1) {
                event.preventDefault();
                selectSuggestedQuestion(filteredQuestions.value[activeIndex.value]);
            }
            break;
            
        case 'Escape':
            showAutocomplete.value = false;
            break;
    }
};

// Update handleTextareaInput to ensure ordered suggestions
const handleTextareaInput = (event) => {
    const query = selectedQuestion.value;
    
    // Show autocomplete dropdown when text is entered
    showAutocomplete.value = true;
    
    // Filter questions based on input, preserving original order
    if (!query.trim().length) {
        // Make a fresh copy of the suggestions array to ensure order is maintained
        filteredQuestions.value = [...suggestedQuestions.value];
    } else {
        // Filter while preserving original order
        filteredQuestions.value = suggestedQuestions.value.filter((item) => {
            return item.toLowerCase().includes(query.toLowerCase());
        });
    }
    
    // Always reset active index when input changes
    activeIndex.value = -1;
    
    console.log('Filtered questions count:', filteredQuestions.value.length);
    console.log('Filtered questions array:', filteredQuestions.value);
};

// Update handleTextareaFocus to ensure ordered suggestions
const handleTextareaFocus = () => {
    // Show all suggestions when textarea is focused, if we have any
    if (suggestedQuestions.value.length > 0) {
        showAutocomplete.value = true;
        // Make a fresh copy of the suggestions array to ensure order is maintained
        filteredQuestions.value = [...suggestedQuestions.value];
        activeIndex.value = -1; // Reset active index when showing suggestions
        console.log('Textarea focused, showing suggestions:', filteredQuestions.value);
    }
};

// Handle textarea blur to hide dropdown with delay
const handleTextareaBlur = () => {
    // Only hide if we're allowing blur to affect visibility
    if (allowBlurToHide.value) {
        // Use setTimeout to allow click events on dropdown items to complete
        setTimeout(() => {
            showAutocomplete.value = false;
            console.log('Hiding autocomplete dropdown');
        }, 200);
    }
};

// Enhanced selectSuggestedQuestion to work with the dropdown
const selectSuggestedQuestion = (question) => {
    selectedQuestion.value = question;
    showAutocomplete.value = false;
    console.log('Selected question:', question);
    
    // Safely focus the textarea after selecting a suggestion
    nextTick(() => {
        if (questionTextarea.value && typeof questionTextarea.value.focus === 'function') {
            try {
                questionTextarea.value.focus();
            } catch (e) {
                console.error('Error focusing textarea:', e);
            }
        }
    });
};

// Improved scrollChatToBottom function to prevent scroll jittering
const scrollChatToBottom = (forceSmooth = true) => {
    console.log('Attempting to scroll to bottom, forceSmooth:', forceSmooth);
    
    // Use setTimeout to ensure DOM is fully updated
    setTimeout(() => {
        // Find all potential scrollable containers
        const chatContainer = document.querySelector('.chat-interface-container');
        const scrollableElement = document.querySelector('.custom-scrollbar');
        const docSummary = document.querySelector('.docsummary-container');
        
        // Create a common scroll function to apply consistent behavior
        const scrollElementToBottom = (element, smooth = forceSmooth) => {
            if (!element) return;
            
            try {
                // Use scrollTo with options for smoother scrolling
                element.scrollTo({
                    top: element.scrollHeight,
                    behavior: smooth ? 'smooth' : 'auto'
                });
                
                // Release scroll control after animation completes
                if (smooth) {
                    setTimeout(() => {
                        // Re-scroll with auto to ensure we reached the bottom and fix any jittering
                        element.scrollTo({
                            top: element.scrollHeight,
                            behavior: 'auto'
                        });
                    }, 300);
                }
            } catch (error) {
                console.error('Error scrolling element to bottom:', error);
                // Fallback to the simple method
                element.scrollTop = element.scrollHeight;
            }
        };
        
        // Try scrolling each potential container
        if (chatContainer) {
            scrollElementToBottom(chatContainer);
            console.log('Scrolled chat container to bottom', chatContainer.scrollHeight);
        }
        
        if (scrollableElement) {
            scrollElementToBottom(scrollableElement);
            console.log('Scrolled custom-scrollbar to bottom', scrollableElement.scrollHeight);
        }
        
        if (docSummary) {
            scrollElementToBottom(docSummary);
            console.log('Scrolled docSummary to bottom', docSummary.scrollHeight);
        }
        
        // As a fallback, try scrolling all elements with class containing 'scroll'
        document.querySelectorAll('[class*="scroll"]').forEach(el => {
            scrollElementToBottom(el, false); // Use auto behavior for these to avoid conflicts
        });
        
        // Ensure scroll is properly released for user control
        setTimeout(() => {
            // This timeout ensures we don't interfere with user scrolling after the content is loaded
            if (scrollableElement) {
                scrollableElement.style.pointerEvents = 'auto';
            }
            if (chatContainer) {
                chatContainer.style.pointerEvents = 'auto';
            }
        }, 350);
    }, 100); // Small delay to ensure DOM update has completed
};

// Update the handleAsk function to better handle the question being posted and the upcoming response
const handleAsk = () => {
    // Don't process empty questions
    if (!selectedQuestion.value || selectedQuestion.value.trim() === '') {
        console.log('Empty question, not submitting');
        return;
    }

    const questionText = selectedQuestion.value.trim();
    console.log('Submitting question:', questionText);
    
    // First try to get document ID from doc.value
    let documentId = doc.value?.id;
    
    // If not available, try to get it from the first chat message
    if (!documentId && chat_messages.value && chat_messages.value.length > 0) {
        documentId = chat_messages.value[0].chat_id;
        console.log('Using document ID from chat_messages:', documentId);
    }
    
    // Check if we have a document ID to ask against
    if (!documentId) {
        console.error('No document ID available for question');
        // Instead of calling handleError, add an error message to the chat
        addErrorMessageToChat('No document available to ask questions against');
        return;
    }
    
    // Add a temporary user question to the chat
    const tempUserQuestion = {
        id: 'temp-question-' + Date.now(),
        created_at: new Date().toISOString(),
        user_id: user.value?.uid || 'user',
        chat_id: documentId,
        chat_type: 'document',
        user_prompt: questionText,
        event_name: 'user_question',
        // Empty response for a question
        response: JSON.stringify({
            answer_for_chat: `<div class="user-question">Thinking...</div>`,
            status: 'Pending'
        })
    };
    
    // Add the user's question to the chat immediately
    if (chat_messages.value) {
        chat_messages.value.push(tempUserQuestion);
    } else {
        chat_messages.value = [tempUserQuestion];
    }
    
    // Save updated chat for current URL
    if (active_tab.value && active_tab.value.url) {
        chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
    }
    
    // Scroll to bottom to show the new question
    nextTick(() => {
        scrollChatToBottom();
    });
    
    // Clear the input after submitting
    selectedQuestion.value = '';
    
    // Hide autocomplete dropdown
    showAutocomplete.value = false;
    
    // Send message to background script to ask the question
    // IMPORTANT: Maintain the exact payload format that the backend expects
    chrome.runtime.sendMessage({
        name: CommunicationEnum.ASK_QUESTION,
        payload: {
            document_id: documentId,
            question: questionText
        }
    }).then(response => {
        console.log('Ask question response:', response);
        
        // If response contains an immediate answer, handle it
        if (response && response.answer) {
            console.log('Got immediate answer:', response.answer);
            
            // The websocket will handle displaying the answer, but we'll add a fallback
            // Wait a bit to see if websocket delivers the message
            setTimeout(() => {
                // Check if any non-temporary messages were added since we sent the question
                const latestMessages = chat_messages.value.filter(msg => 
                    !msg.id || (typeof msg.id === 'string' && !msg.id.startsWith('temp-question-'))
                );
                
                // If no new messages, use the direct response
                if (latestMessages.length === chat_messages.value.length - 1) {
                    console.log('No websocket message received, using direct response');
                    // Create a message from the response
                    const answerMessage = {
                        id: response.answer.id || ('answer-' + Date.now()),
                        created_at: response.answer.created_at || new Date().toISOString(),
                        user_id: response.answer.user_id || 'system',
                        chat_id: documentId,
                        chat_type: response.answer.chat_type || 'document',
                        user_prompt: questionText,
                        event_name: response.answer.event_name || 'answer',
                        response: response.answer.response
                    };
                    
                    // Replace the temporary message with the real one
                    chat_messages.value = chat_messages.value.filter(msg => 
                        !msg.id || (typeof msg.id === 'string' && !msg.id.startsWith('temp-question-'))
                    );
                    chat_messages.value.push(answerMessage);
                    
                    // Save updated chat for current URL
                    if (active_tab.value && active_tab.value.url) {
                        chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
                    }
                    
                    // Scroll to bottom to show the answer
                    nextTick(() => {
                        scrollChatToBottom();
                    });
                }
            }, 2000); // Give the websocket 2 seconds to deliver the message
        }
    }).catch(error => {
        console.error('Error asking question:', error);
        // Add error to chat instead of showing banner
        addErrorMessageToChat('Error submitting your question. Please try again.');
    });
}
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

/* Update ask-input for textarea */
.ask-input {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: var(--surface-card);
    padding: 0.5rem;
    border-top: 1px solid var(--surface-border);
    min-height: 60px;
    z-index: 1001;
    width: 100%;
    box-sizing: border-box;
}

/* Style for textarea */
.textarea-with-autocomplete {
    position: relative;
    flex: 1;
    min-width: 0; /* Prevent flex item from overflowing */
    box-sizing: border-box;
}

:deep(.p-inputtextarea) {
    width: 100% !important;
    box-sizing: border-box !important;
    resize: none;
    max-height: 120px;
    overflow-y: auto;
    line-height: 1.4;
    padding: 0.5rem 0.75rem;
    min-height: 2.8rem;
    margin: 0;
    border-radius: 6px;
}

/* Style for suggested questions */
.suggested-questions {
    max-height: 80px;
    overflow-y: auto;
    padding-bottom: 5px;
}

.suggestion-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.suggestion-pill {
    background-color: #f0f7ff;
    border: 1px solid #d0e1fd;
    color: #1e3a8a;
    border-radius: 16px;
    padding: 2px 10px;
    font-size: 0.75rem;
    cursor: pointer;
    display: inline-block;
    max-width: 200px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.suggestion-pill:hover {
    background-color: #e0effe;
}

/* Adjust scrollbar height to account for larger ask input */
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

/* Update dropdown styles for perfect alignment */
.autocomplete-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 100%;
    background-color: white;
    border: 2px solid var(--primary-color);
    border-radius: 6px;
    box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.25);
    max-height: 250px;
    overflow-y: auto;
    z-index: 9999;
    box-sizing: border-box;
    margin-bottom: 3px;
}

.debug-dropdown {
    background-color: #e3f2fd;
    color: #0d47a1;
    padding: 4px 8px;
    font-size: 12px;
    text-align: center;
    border-bottom: 1px solid #bbdefb;
}

.autocomplete-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.autocomplete-item {
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--surface-border);
    white-space: normal;
    word-break: break-word;
    line-height: 1.4;
    font-size: 0.9rem;
    background-color: white;
}

.autocomplete-item:last-child {
    border-bottom: none;
}

.autocomplete-item:hover,
.autocomplete-item-active {
    background-color: var(--surface-hover);
}

/* Update the ask input container */
.ask-input {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: var(--surface-card);
    padding: 0.5rem;
    border-top: 1px solid var(--surface-border);
    min-height: 60px;
    z-index: 1001;
    width: 100%;
    box-sizing: border-box;
}

/* Update the flex container to ensure proper width calculation */
.flex.gap-2 {
    position: relative;
    display: flex;
    gap: 0.5rem;
    width: 100%;
    box-sizing: border-box;
    align-items: flex-start;
}

/* Update textarea container for consistent width */
.textarea-with-autocomplete {
    position: relative;
    flex: 1;
    min-width: 0; /* Prevent flex item from overflowing */
    box-sizing: border-box;
}

/* Update textarea styles for proper sizing */
:deep(.p-inputtextarea) {
    width: 100% !important;
    box-sizing: border-box !important;
    resize: none;
    max-height: 120px;
    overflow-y: auto;
    line-height: 1.4;
    padding: 0.5rem 0.75rem;
    min-height: 2.8rem;
    margin: 0;
    border-radius: 6px;
}

/* Update dropdown styles for perfect alignment */
.autocomplete-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 100%;
    background-color: white;
    border: 2px solid var(--primary-color);
    border-radius: 6px;
    box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.25);
    max-height: 250px;
    overflow-y: auto;
    z-index: 9999;
    box-sizing: border-box;
    margin-bottom: 3px;
}

/* Ensure the send button doesn't affect textarea width */
.p-button-rounded {
    flex-shrink: 0;
}

/* Remove any conflicting margins or paddings */
.flex-grow-1 {
    margin: 0;
    padding: 0;
}

/* Ensure proper width inheritance */
:deep(.p-inputtextarea-resizable) {
    width: 100% !important;
}

:deep(.p-inputtextarea-wrapper) {
    width: 100% !important;
}

/* User question styling */
:deep(.user-question) {
    background-color: #f0f7ff;
    color: #1e3a8a;
    padding: 10px 15px;
    border-radius: 8px;
    margin: 5px 0;
    font-style: italic;
}

/* Error message styling */
:deep(.error-message) {
    background-color: #fff5f5;
    color: #e53e3e;
    padding: 10px 15px;
    border-radius: 8px;
    border-left: 4px solid #e53e3e;
    margin: 8px 0;
}

/* Ensure the chat interface scrolls properly */
.chat-interface-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding-bottom: 60px; /* Give space for the input area */
}

/* Style chat interface to fill space */
:deep(.chat-container) {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
}

/* Add styles for debugging item indexes */
.item-index {
    display: none; /* Hide this completely since we're not using it anymore */
}
</style>