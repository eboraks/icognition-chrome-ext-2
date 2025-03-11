<template>
    <div style="width: 450px; height: 600px">        
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

            <div v-if="status.state === AppStatusEnum.READY.state" class="flex align-items-center justify-content-center m-2 p-2">
                <Button @click="handleBookmark" label="Add to Library" icon="pi pi-plus" class="flex"></Button>
            </div>
        </div>

        <!-- Chat interface container -->
        <div v-if="chat_messages && chat_messages.length > 0" class="chat-interface-container">
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
import DocSummary from '../../public/js/components/DocSummary.vue';  // Updated import path
import GoogleLoginButton from '../../public/js/components/GoogleLoginButton.vue';
import ProgressBar from 'primevue/progressbar';
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
const library_url = ref(import.meta.env.VITE_ICOGNITION_APP_URL)
const progressPercent = ref(5)
const user = ref(null)


onMounted(async () => {
    // Get and store the active tab when popup opens
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
        await chrome.storage.session.set({ active_tab_id: tabs[0].id });
        console.log('Stored active tab ID:', tabs[0].id);
    }
});



console.log('1 . Popup -> status:', status.value)
// Check if server is running
if (status.value.state === 'initializing') {
    chrome.runtime.sendMessage({ name: 'server-is' }).then((response) => {
        console.log('Status -> server-is', response)
        if (response.status === 'up') {
            // If server is up, check user state
            chrome.storage.session.get(["session_user"]).then((session) => {
                if (session.session_user) {
                    status.value = AppStatusEnum.READY
                    statusMessage.value = AppStatusEnum.READY.message
                } else {
                    status.value = AppStatusEnum.UNAUTHENTICATED
                    statusMessage.value = AppStatusEnum.UNAUTHENTICATED.message
                }
            })
        } else {
            status.value = AppStatusEnum.SERVER_DOWN
        }
    })
}


console.log('2. Popup -> status:', status.value)
chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    active_tab.value = tabs[0]
    console.log('3. Popup -> active_tab:', active_tab.value)
})

console.log('4. Popup -> status:', status.value)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'session' && changes.session_user) {
        console.log('5. Session user changed:', changes.session_user.newValue)
        user.value = changes.session_user.newValue
    }
})

console.log('6. Popup -> status:', status.value)
chrome.storage.session.get(["session_user"]).then((session_user) => {
    console.log('7. popup -> user_uid: ', session_user.session_user)
    if (session_user.session_user) {
        user.value = session_user.session_user
        chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
            active_tab.value = tabs[0]
            console.log('8. Popup -> Session_User -> active_tab:', active_tab.value)
            searchBookmarksByUrl(active_tab.value.url)
        })
    } else {
        console.log('9. sidepanel -> no user found in session storage!')
    }
});

watch(user, (after, before) => {
    if (after) {
        console.log('10. User logged in! ', user.value)
        status.value = AppStatusEnum.READY
    } else {
        console.log('11. User logged out!')
        status.value = AppStatusEnum.UNAUTHENTICATED
        chrome.storage.local.remove('bookmarks')
        bookmarks.value = []
    }
});

const searchBookmarksByUrl = async (url) => {

    if (!url) {
        console.log('searchBookmarksByUrl -> url is null')
        return
    }

    
    if (!user) {
        console.log('searchBookmarksByUrl -> user not authenticated')
        return
    }

    const value = await chrome.storage.local.get(["bookmarks"]);
    console.log('searchBookmarksByUrl -> url:', url)
    console.log('searchBookmarksByUrl -> value: ', value)

    if (value.bookmarks) {
        value.bookmarks = value.bookmarks.filter(bookmark => bookmark != null && bookmark !== undefined);
    }

    if (value.bookmarks) {
        let found;
        try {
            found = value.bookmarks.find(bookmark => bookmark.url == cleanUrl(url));

            if (!found) {
                console.log('searchBookmarksByUrl -> no bookmarks found in local storage, calling server')
                await handleBookmark()
                return
            } else {
                status.value = AppStatusEnum.READY
                bookmark.value = found
                console.log('searchBookmarksByUrl -> found bookmark:', bookmark.value)
                fetchChat(bookmark.value.document_id)
                return
            }

        } catch (error) {
            console.error('Error searching bookmarks by URL:', error);
            status.value = AppStatusEnum.ERROR
            statusMessage.value = 'Error searching bookmarks'
            await handleBookmark()
            return;
        }
    } 
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('12. Popup -> onMessage:', request.name)
    
    if (request.name === CommunicationEnum.NEW_DOC) {
        doc.value = request.data
        status.value = AppStatusEnum.DOCUMENT_READY
        console.log('13. Popup -> new document, status:', status.value.state)
    }

    if (request.name === CommunicationEnum.CHAT_READY) {
        console.log('15. Popup -> chat_message:', request.data)
        chat_messages.value = request.data
        status.value = AppStatusEnum.DOCUMENT_READY
        console.log('15. Popup -> chat_message:', chat_messages.value)
        
    }

    if (request.name === CommunicationEnum.CHAT_NOT_READY) {
        status.value = AppStatusEnum.ERROR
        statusMessage.value = '16. Popup -> chat_not_ready: Error fetching chat messages'
    }

    if (request.name === CommunicationEnum.CHAT_MESSAGE) {
        const newChatMessage = JSON.parse(request.data);
        console.log('17. Popup -> new chat message:', newChatMessage)
        
        // Add the new chat message to the existing messages
        if (chat_messages.value) {
            chat_messages.value.push(newChatMessage);
        } else {
            chat_messages.value = [newChatMessage];
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
            console.log('18. Popup -> progress percentage:', progressPercent.value)
        }
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
                    console.log('18. Popup -> Update Bookmarks -> active_tab:', active_tab.value)
                    searchBookmarksByUrl(active_tab.value.url)
                } else {
                   //Set status to ready
                   status.value = AppStatusEnum.READY
                }
                
            }
        }
    }
});

const handleBookmark = async () => {
    status.value = AppStatusEnum.PROCESSING
    statusMessage.value = AppStatusEnum.PROCESSING.message

    chrome.runtime.sendMessage({name: 'bookmark-page', tab: active_tab.value}).then((response) => {
        console.log('handleBookmark -> response:', response)

        if (response.status === 201) {
            bookmark.value = response.content
            status.value = AppStatusEnum.PROCESSING
        } else if (response.status === 200) {
            bookmark.value = response.content
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

const handleRegenerateDocument = async () => {
    status.value = AppStatusEnum.PROCESSING
    console.log('handleRegenerateDocument -> document title:', doc.value.title)
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    chrome.runtime.sendMessage({
            name: 'regenerate-document', tab: tabs[0], document: doc.value
        }).then((response) => {
            console.log('handleRegenerateDocument -> response:', response)
        })
}

const fetchDocument = async (bookmark_id) => {
    console.log('fetchDocument -> bookmark_id:', bookmark_id)
    chrome.runtime.sendMessage({ name: 'fetch-document', bookmark_id: bookmark_id }).then((response) => {
        console.log('Popup -> fetch-document response:', response)
        if (response.document) {
            if (response.document.status !== 'Done') {
                status.value = AppStatusEnum.ERROR
                statusMessage.value = response.document.llmServiceMeta?.message || 
                    'This page is not an article or is not supported.'
            } else {
                status.value = AppStatusEnum.DOCUMENT_READY
                doc.value = response.document
                
                // Fetch chat messages for this document using the new endpoint
                const document_id = doc.value.id;
                chrome.runtime.sendMessage({ 
                    name: CommunicationEnum.FETCH_CHAT, 
                    document_id: document_id 
                }).then((chatResponse) => {
                    console.log('Popup -> fetch-chat response:', chatResponse)
                    if (chatResponse && chatResponse.success && chatResponse.chat) {
                        chat_messages.value = chatResponse.chat;
                    } else {
                        console.error('Failed to fetch chat messages:', chatResponse?.error || 'Unknown error');
                        // Initialize with empty array if fetch fails
                        chat_messages.value = [];
                    }
                }).catch(error => {
                    console.error('Error fetching chat messages:', error);
                    chat_messages.value = [];
                });
            }
        } else {
            status.value = AppStatusEnum.PROCESSING
        }
    })
}

chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
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
}); 

// Add these methods to handle the events
const handleRemoveChatItem = (uuid) => {
    if (chat_messages.value) {
        chat_messages.value = chat_messages.value.filter(item => item.id !== uuid);
    }
}

const handleAddChatItem = (newItem) => {
    if (chat_messages.value) {
        chat_messages.value.push(newItem);
    } else {
        chat_messages.value = [newItem];
    }
}

</script>

<style scoped>
.header {
    border-bottom: 1px solid #e0e0e0;
}

.chat-interface-container {
    height: calc(100% - 80px);
    overflow: hidden;
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
</style>