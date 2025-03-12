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

        <div v-if="status.severity === AppStatusEnum.ERROR.severity" class="m-2 p-2 flex align-items-center justify-content-center">
            <Message id="status-message" 
                    :severity="status.severity" 
                    class="w-full" 
                    :closable="false">
                {{ status.message }}
            </Message>
        </div>
        
        <div v-if="debug_mode" class="debug">
            <p>Status: {{ status.state }}</p>
            <p>Status Message: {{ statusMessage }}</p>
            <p>Document: {{ doc?.id }}</p>
            <p>User: {{ user?.uid }}</p>
            <p>Progress Percent: {{ progressPercent }}</p>
        </div>
    </div>
</template>
<script setup>
import { ref, onMounted, watch } from 'vue'
import { cleanUrl, CommunicationEnum } from '../../public/js/composables/utils.js';
import Button from 'primevue/button';
import DocSummary from '../../public/js/components/DocSummary.vue';
import GoogleLoginButton from '../../public/js/components/GoogleLoginButton.vue';
import ProgressBar from 'primevue/progressbar';
import Message from 'primevue/message';
import useAuth from '../../public/js/composables/useAuth.js';

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
const debug_mode = ref(false)
const library_url = ref(import.meta.env.VITE_ICOGNITION_APP_URL || 'https://app.icognition.ai')
const progressPercent = ref(5)
const user = ref(null)

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
    
    // Reset current chat and status
    chat_messages.value = null;
    bookmark.value = null;
    doc.value = null;
    progressPercent.value = 5;
    console.log('Reset chat, bookmark, and doc');
    
    // Check if we have a saved chat for this URL
    if (chatsByUrl.value[currentUrl] && chatsByUrl.value[currentUrl].length > 0) {
        console.log('Found saved chat for URL:', currentUrl);
        chat_messages.value = chatsByUrl.value[currentUrl];
        bookmark.value = bookmarksByUrl.value[currentUrl] || null;
        
        if (documentIdsByUrl.value[currentUrl]) {
            status.value = AppStatusEnum.DOCUMENT_READY;
            console.log('Setting status to DOCUMENT_READY');
        } else {
            status.value = AppStatusEnum.READY;
            console.log('Setting status to READY (saved chat but no document ID)');
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
    console.log('Should show Analyze button:', 
        status.value.state === AppStatusEnum.READY.state && 
        (!chat_messages.value || chat_messages.value.length === 0));
};

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
            status.value = AppStatusEnum.ERROR;
            statusMessage.value = 'Error searching bookmarks';
            console.log('Error searching bookmarks, setting status to ERROR');
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
        console.log('Chat message:', request.data)
        chat_messages.value = request.data
        status.value = AppStatusEnum.DOCUMENT_READY
        console.log('Chat message:', chat_messages.value)
        
        // Save chat for current URL
        if (active_tab.value && active_tab.value.url) {
            chatsByUrl.value[cleanUrl(active_tab.value.url)] = [...chat_messages.value];
        }
    }

    if (request.name === CommunicationEnum.CHAT_NOT_READY) {
        status.value = AppStatusEnum.ERROR
        statusMessage.value = 'Chat not ready: Error fetching chat messages'
    }

    if (request.name === CommunicationEnum.CHAT_MESSAGE) {
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
        if (status.value !== AppStatusEnum.DOCUMENT_READY && doc.value == null) {
            status.value = AppStatusEnum.PROCESSING
            progressPercent.value = Math.min(99, progressPercent.value + request.data)
            console.log('Progress percentage:', progressPercent.value)
        }
    }
    
    if (request.name === 'error-bookmarking') {
        console.log('error-bookmarking -> request', request)
        status.value = AppStatusEnum.ERROR
        doc.value = null
        statusMessage.value = request.data
        sendResponse({ message: 'bookmark-page recived' })
    }

    if (request.name === 'question-answers-ready') {
        console.log('document-ready -> request', request)
        doc.value = request.data
        status.value = AppStatusEnum.READY
        sendResponse({ message: 'document-ready recived' })
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
                status.value = AppStatusEnum.ERROR
                statusMessage.value = response.content.detail || 'Error creating bookmark'
                status.value.message = response.content.detail || 'Error creating bookmark'
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
            // Initialize with empty array if fetch fails
            chat_messages.value = [];
            status.value = AppStatusEnum.ERROR;
            statusMessage.value = 'Failed to fetch chat messages';
        }
    }).catch(error => {
        console.error('Error fetching chat messages:', error);
        chat_messages.value = [];
        status.value = AppStatusEnum.ERROR;
        statusMessage.value = 'Error fetching chat messages';
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
    position: absolute;
    bottom: 0;
    left: 0;
    font-size: 10px;
    background-color: rgba(255, 255, 255, 0.8);
    padding: 5px;
    z-index: 1000;
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
</style>