<template>
    <div style="width: 450px; height: 200px">        
        <div class="header bg-primary-800 w-full h-20">
            <div class="flex justify-content-between align-items-center">
                <img src="/icons/iCognitionLogo.png" alt="iCognition Logo"  width="150px" class="m-2"/>
                <div class="pi pi-sign-out text-white mr-4 flex align-items-center" v-if="user" @click="handleSignOut"></div>
            </div>

        </div>
        <div class="flex flex-column">
            <div v-show="!server_status" class="m-2 p-2">
            <ProgressBar mode="indeterminate"></ProgressBar>
            <p>Starting service...</p>
            </div>
            <div v-if="server_status === false" class="flex align-items-center justify-content-center m-2 p-2">
                <ProgressBar mode="indeterminate"></ProgressBar>
            </div>

            <div v-if="server_status == 'down'" class="message_container flex align-items-center justify-content-center">
                <p class="error">Error connecting to server</p>
            </div>


            <div v-if="progressPercent > 0 && progressPercent < 100" class="message_container flex align-items-center justify-content-center">
                <ProgressBar :value="progressPercent"></ProgressBar>
            </div>

            <div v-if="server_status =='up'" class="flex align-items-center justify-content-center m-2 p-2">
                <div v-if="!user" class="button_container">
                    <GoogleLoginButton></GoogleLoginButton>
                </div>
            </div>

            <div v-if="bookmark_status == BookmarkStatusEnum.ADD_TO_ICOGNITION && user != null" class="flex align-items-center justify-content-center m-2 p-2">
                <Button @click="handleBookmark" label="Add to Library" icon="pi pi-plus" class="flex"></Button>
            </div>

        </div>

        <div v-if="doc_status === 'processing' && user != null" class="flex flex-column">
            <Skeleton class='mb-2 p-1'></Skeleton>
            <Skeleton width="20rem" class='mb-2 p-1'></Skeleton>
            <Skeleton class='mb-2 p-1'></Skeleton>
            <Skeleton width="25rem" class='mb-2 p-1'></Skeleton>
            <Skeleton class='mb-2 p-1'></Skeleton>
            <Skeleton width="20rem" class='mb-2 p-1'></Skeleton>
            <Skeleton class='mb-2 p-1'></Skeleton>
            <Skeleton width="30rem" class='mb-2 p-1'></Skeleton>
            <Skeleton class='mb-2 p-1'></Skeleton>
            <Skeleton width="20rem" class='mb-2 p-1'></Skeleton>
        </div>


        <div v-if = "doc_status == 'ready' && user != null" class="flex align-items-center justify-content-center">
            <DocSummary :doc="doc"></DocSummary>
        </div>
        
        
        

        <div v-if="error_bookmark" class="message_container">
            <p class="error">{{ error_bookmark }}</p>
        </div>
        <div class="absolute bottom-0 left-0 m-2">
            <a :href="library_url" target="_blank" class="flex align-items-center text-primary no-underline">
            <i class="pi pi-external-link mr-2"></i>
            Open iCognition Library
            </a>
        </div>

        <div v-if="debug_mode" class="debug">
           
            <p>User: {{ user }}</p>
            
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
import Skeleton from 'primevue/skeleton';
import useAuth from '../../public/js/composables/useAuth.js';

const { handleSignOut } = useAuth()


// Add the enum before the component setup
const BookmarkStatusEnum = {
    ADD_TO_ICOGNITION: 'Add to iCognition',
    PROCESSING: 'Processing',
    BOOKMARK_ADDED: 'bookmark_added',
    BOOKMARK_EXISTS: 'bookmark_exists',
    ERROR: 'error',
    NO_CONTENT_FOUND: 'no_content_found',
    REGENERATE_SUMMARY: 'Regenerate Summary'
} 

const bookmark = ref(null)
const bookmarks = ref([])
const server_status = ref(false)
const active_tab = ref(null)
const error_bookmark = ref(null)
const bookmark_status = ref(BookmarkStatusEnum.ADD_TO_ICOGNITION)
const doc_status = ref(null)
const doc = ref(null)
const qanda = ref(null)
const qanda_status = ref(null)
const debug_mode = ref(false)
const library_url = ref(import.meta.env.VITE_ICOGNITION_APP_URL)
const progressPercent = ref(0)
const user = ref(null) 



// Send message to background.js asking if server is running
if (server_status.value === false) {
    chrome.runtime.sendMessage({ name: 'server-is' }).then((response) => {
        console.log('Sidepanel -> server-is', response)
        server_status.value = response.status
    })
}

// Get the active tab and set it to active_tab ref
chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    active_tab.value = tabs[0]
    console.log('Popup -> active_tab:', active_tab.value)
})


//Listen to storage.session for user login
// Listen to storage.session changes for user login/logout
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'session' && changes.session_user) {
        console.log('Session user changed:', changes.session_user.newValue)
        user.value = changes.session_user.newValue
    }
})


// On popup open, check if user is logged in, if yes check for bookmarks
chrome.storage.session.get(["session_user"]).then((session_user) => {
    console.log('popup -> user_uid: ', session_user.session_user)
    if (session_user.session_user) {
        user.value = session_user.session_user
        //Check for bookmarks on open, if user is logged in
        //Note: the the if bookmark isn't found in local storage, the server will be called
        //to create a bookmark. If the bookmark exists on the server, it will be returned. 
        //This behaviour create bookmark on action button click. 
        chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
            active_tab.value = tabs[0]
            console.log('Popup -> Session_User -> active_tab:', active_tab.value)
            searchBookmarksByUrl(active_tab.value.url)
        })

        
    } else {
        console.log('sidepanel -> no user found in session storage!')
    }
});

//Watch for user login and logout
watch(user, (after, before) => {
    if (after !== undefined && after !== null) {
        console.log('User logged in! ', user.value)
    }else if (after === undefined || after === null) {
        console.log('User logged out!')
        //Remove bookmarks from local storage
        chrome.storage.local.remove('bookmarks')
        bookmarks.value = []
    }
    
});




const searchBookmarksByUrl = async (url) => {

    
    if (!user) {
        console.log('searchBookmarksByUrl -> user not authenticated')
        return
    }

    const value = await chrome.storage.local.get(["bookmarks"]);
    console.log('searchBookmarksByUrl -> url:', url)
    console.log('searchBookmarksByUrl -> value: ', value)


    // Remove null and undefined values from bookmarks array
    if (value.bookmarks) {
        value.bookmarks = value.bookmarks.filter(bookmark => bookmark != null && bookmark !== undefined);
    }

    if (value.bookmarks) {
        //Search local storage for bookmarks, if not found, call server
        let found;
        try {
            found = value.bookmarks.find(bookmark => bookmark.url == cleanUrl(url));

            if (!found) {
                console.log('searchBookmarksByUrl -> no bookmarks found in local storage, calling server')
                //If no bookmarks found in local storage, call server to create a bookmark, if the bookmark exists
                // on the server, it will respond with the bookmark object
                await handleBookmark()
                return
            } else {
                console.log('searchBookmarksByUrl -> found:', found)
                bookmark_status.value = BookmarkStatusEnum.REGENERATE_SUMMARY
                bookmark.value = found

                //Fetch document from server
                fetchDocument(bookmark.value.id)
                return
            }


        } catch (error) {
            console.error('Error searching bookmarks by URL:', error);
            error_bookmark.value = 'Error searching bookmarks';
            await handleBookmark()
            return;
        }
        
    } 
    
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    console.log('Popup -> onMessage:', request.name)
    
    if (request.name === CommunicationEnum.NEW_DOC) {
        console.log('Popup -> new document:', request)
        doc_status.value = 'ready'
        doc.value = JSON.parse(request.data)
    }

    if (request.name === CommunicationEnum.NEW_QANDA) {
        console.log('Popup -> new qanda:', request)
        qanda_status.value = 'ready'
        qanda.value = JSON.parse(request.data)
        console.log('Popup -> qanda:', qanda.value)
    }

    if (request.name === CommunicationEnum.PROGRESS_PERCENTAGE) {
        progressPercent.value += request.data
    }
})




//Listen for changes in bookmarks storage and update ref accordingly
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
            }
        }
  }
});


//Methods to handle events
const handleBookmark = async () => {
    bookmark_status.value = BookmarkStatusEnum.PROCESSING
    error_bookmark.value = null

    chrome.runtime.sendMessage({name: 'bookmark-page', tab: active_tab.value}).then((response) => {
        console.log('handleBookmark -> response:', response)

        if (response.status === 201) {
            console.log('handleBookmark -> bookmark:', response.content)
            bookmark.value = response.content
            bookmark_status.value = BookmarkStatusEnum.BOOKMARK_ADDED
            doc_status.value = 'processing'
        } else if (response.status === 200) {
            console.log('handleBookmark -> bookmark:', response.content)
            bookmark.value = response.content
            bookmark_status.value = BookmarkStatusEnum.BOOKMARK_EXISTS

            fetchDocument(bookmark.value.id)

            
        } else if (response.status >= 400) {
            bookmark_status.value = BookmarkStatusEnum.ERROR
            error_bookmark.value = response.content
        } else {
            bookmark_status.value = BookmarkStatusEnum.NO_CONTENT_FOUND
            error_bookmark.value = response.content
        }
    })
    return true
}

//Regenerate document
const handleRegenerateDocument = async () => {
    doc_status.value = 'processing'
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
            doc.value = response.document
            doc_status.value = 'ready'
        } else {
            doc_status.value = 'processing'
        }
    })
}


chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
        
        if (request.name === 'error-bookmarking') {
            console.log('error-bookmarking -> request', request)
            doc_status.value = 'error'
            doc.value = null
            error_bookmark.value = request.data
            sendResponse({ message: 'bookmark-page recived' })
        }

        if (request.name === 'question-answers-ready') {
            console.log('document-ready -> request', request)
            doc.value = request.data
            doc_status.value = 'ready'
            sendResponse({ message: 'document-ready recived' })
        }
}); 

</script>