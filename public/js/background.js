import { ref, onMounted, watch } from 'vue'
import { cleanUrl, CommunicationEnum } from './composables/utils.js'

const user = ref(null)
const socket = ref(null)
let isSidePanelOpen = false; // Track side panel state

const base_url = import.meta.env.VITE_BASE_URL || 'http://localhost:8889'
console.log('base_url: ', base_url)

const Endpoints = {
    ping: '/ping',
    bookmark: '/bookmark',
    regenrate: '/document/regenerate',
    document_plus: '/document_plus/{ID}',
    user_bookmarks: '/bookmarks/user/{ID}',
    user_bookmark: '/bookmark/user',
    qanda: '/document/{id}/questions_answers',
    chat: '/document/{id}/chat',
    ask_question: '/ask_question',
    delete_chat_message: '/chat_message/{id}',
    delete_bookmark: '/bookmark/{id}',
}

// Listen to changes in storage and if session_user changes, refresh the bookmarks cache, or delete the cache if the user logs out
chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        
        // Listen to update to session_user (login) to refresh the bookmarks cache
        if (key === 'session_user') {

            if (newValue === undefined) {
                console.log("Detected user logout: ", newValue)
                chrome.storage.local.remove('bookmarks')
            } else if (newValue !== undefined && oldValue === undefined) {
                console.log("Detected user login: ", newValue)
                user.value = newValue
                refreshBookmarksCache(user.value.uid)
                registerWebSocketConnection()
            }
        }
    }
});

// Add these variables to track connection state
let isConnecting = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectTimeout = null;
let heartbeatInterval = null;

// Global variable to store logged shortcuts
let recentShortcuts = [];
const MAX_SHORTCUTS = 20; // Maximum number of shortcuts to store

// Function to log commands from the commands API
function logCommand(command) {
    const shortcutInfo = {
        type: 'chrome.command',
        command: command,
        timestamp: new Date().toISOString()
    };
    
    console.log('Command Shortcut Detected:', shortcutInfo);
    
    // Add to recent shortcuts
    recentShortcuts.unshift(shortcutInfo);
    if (recentShortcuts.length > MAX_SHORTCUTS) {
        recentShortcuts.pop();
    }
    
    // Notify any open side panels
    try {
        chrome.runtime.sendMessage({
            name: 'shortcut-logged',
            shortcut: shortcutInfo
        }).catch(err => {
            // Ignore errors - side panel might not be open
        });
    } catch (e) {
        // Ignore errors - side panel might not be open
    }
}

const registerWebSocketConnection = async () => {
    // Prevent multiple simultaneous connection attempts
    if (isConnecting) {
        console.log('Already attempting to connect, skipping');
        return;
    }
    
    isConnecting = true;
    
    const store = await chrome.storage.session.get(["session_user"]);
    if (!store.session_user) {
        console.log('registerWebSocketConnection -> user is null');
        isConnecting = false;
        return;
    }

    // Check if socket is open and valid
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        console.log('WebSocket is already open');
        isConnecting = false;
        return;
    }

    // Clean up any existing connection
    cleanupWebSocket();
    
    try {
        const ws_url = `${base_url}/ws/${store.session_user.uid}/extension`;
        socket.value = new WebSocket(ws_url);
        console.log('WebSocket connection initiated:', ws_url);
        
        socket.value.onopen = () => {
            console.log('WebSocket connection opened successfully');
            isConnecting = false;
            reconnectAttempts = 0;
            
            // Set up heartbeat to keep connection alive
            heartbeatInterval = setInterval(() => {
                if (socket.value && socket.value.readyState === WebSocket.OPEN) {
                    socket.value.send(JSON.stringify({ type: 'ping' }));
                } else {
                    clearInterval(heartbeatInterval);
                }
            }, 30000); // Send heartbeat every 30 seconds
        };

        socket.value.onclose = (event) => {
            console.log('WebSocket connection closed:', event);
            cleanupWebSocket();
            
            // Implement exponential backoff for reconnection
            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                console.log(`Scheduling reconnect attempt ${reconnectAttempts + 1} in ${delay}ms`);
                
                reconnectTimeout = setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect WebSocket (attempt ${reconnectAttempts})`);
                    registerWebSocketConnection();
                }, delay);
            } else {
                console.log('Maximum reconnection attempts reached, giving up');
            }
        };

        socket.value.onerror = (error) => {
            console.error('WebSocket error:', error);
            // Let onclose handle reconnection
        };

        // Move message handler here to ensure it's set up with each new connection
        socket.value.onmessage = (event) => {
            console.log('WebSocket message received:', event.data)
            try {
                const message = JSON.parse(event.data)
                
                if (message.type === 'document') {
                    console.log('WebSocket message document:', message.type, message.document_id)
                    
                    //Send message to side panel to render document
                    chrome.runtime.sendMessage({
                        name: CommunicationEnum.NEW_DOC,
                        data: message.data,
                    }).then((response) => {
                        console.log('render-document response: ', response)
                    })
                }

                

                if (message.type === CommunicationEnum.ERROR) {
                    console.log('WebSocket message error:', message.type, message.data)
                    chrome.runtime.sendMessage({
                        name: CommunicationEnum.ERROR,
                        data: message.data,
                    }).then((response) => {
                        console.log('error response: ', response)
                    }).catch(error => {
                        console.error('Error sending ERROR message:', error)
                    })
                }

                if (message.type === 'document_in_progress') {
                    console.log('WebSocket message document in progress:', message.type, message.data)
                    storeBookmarks(message.data)
                }

                if (message.type === 'document_error') {
                    console.log('WebSocket message document error:', message.type, message.data)
                    storeBookmarks(message.data)
                }
                if (message.type === CommunicationEnum.PROGRESS_PERCENTAGE) {
                    console.log('WebSocket message processing_percentage:', message.type, message.data)
                    chrome.runtime.sendMessage({
                        name: CommunicationEnum.PROGRESS_PERCENTAGE,
                        data: message.data,
                    }).then((response) => {
                        console.log('processing_percentage response: ', response)
                    })
                }

                if (message.type === CommunicationEnum.CHAT_READY) {
                    console.log('WebSocket message document chat:', message.type, message.data)
                    
                    // Ensure the data is properly formatted as an array
                    let chatData = message.data;
                    if (!Array.isArray(chatData)) {
                        console.log('Converting chat data to array:', chatData);
                        chatData = [chatData];
                    }
                    
                    chrome.runtime.sendMessage({
                        name: CommunicationEnum.CHAT_READY,
                        data: chatData,
                    }).then((response) => {
                        console.log('document_chat response: ', response)
                    }).catch(error => {
                        console.error('Error sending CHAT_READY message:', error);
                    });
                }

                if (message.type === CommunicationEnum.SUGGESTED_QUESTIONS) {
                    console.log('WebSocket message suggested questions:', message.type, message.data)
                    chrome.runtime.sendMessage({
                        name: CommunicationEnum.SUGGESTED_QUESTIONS,
                        data: message.data,
                    }).then((response) => {
                        console.log('suggested-questions response: ', response)
                    }).catch(error => {
                        console.error('Error sending suggested questions:', error)
                    })
                }

            } catch (error) {
                console.error('Error parsing WebSocket message:', error)
            }
        }
    } catch (error) {
        console.info('Store session user:', store.session_user)
        console.error('Error opening WebSocket connection:', error)
        // Schedule reconnection with backoff
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000);
            reconnectTimeout = setTimeout(() => {
                reconnectAttempts++;
                registerWebSocketConnection();
            }, delay);
        }
    }
}

// Add a cleanup function
const cleanupWebSocket = () => {
    // Clear any pending reconnect
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    // Clear heartbeat interval
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    
    // Close existing socket if it exists
    if (socket.value) {
        // Remove all event listeners to prevent memory leaks
        socket.value.onopen = null;
        socket.value.onclose = null;
        socket.value.onerror = null;
        socket.value.onmessage = null;
        
        // Only try to close if not already closed
        if (socket.value.readyState !== WebSocket.CLOSED) {
            try {
                socket.value.close();
            } catch (e) {
                console.error('Error closing WebSocket:', e);
            }
        }
    }
    
    isConnecting = false;
}

//Check if socket is open
function isWebSocketOpen() {

    console.log('isWebSocketOpen -> socket: ', socket.value)
    if (socket.value === null) {
        return false
    }

    if (socket.value.readyState === WebSocket.OPEN) {
        return true
    }
    return false
}



// Create a bookmark
async function postBookmark(tab){
    
    let bookmark = null
    let bm_error = null
    let html = null

    if (isWebSocketOpen() === false) {
        console.log('postBookmark -> WebSocket is not open')
        registerWebSocketConnection()
    } 

    const session_user = await chrome.storage.session.get(["session_user"])
    console.log('postBookmark -> user: ', session_user.session_user)


    //If no authproof, return error
    if (!session_user.session_user) {
        bm_error = 'User not authenticated'
        return {bookmark, error: bm_error}
    }

    function getBody() { return document.documentElement.innerHTML; }


    try {
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: false },
            func: getBody,
        });

        if (injectionResults[0].result != null) {
            console.log('postBookmark -> HTML recieved from content script')
            html = injectionResults[0].result
        }
    } catch (error) {
        //If error, log error and continue without the html
        console.log('postBookmark error executing script: ', error)
    }
    

    try {
        // Clean the URL before sending to server
        const cleanedUrl = cleanUrl(tab.url);
        let response = await fetch(`${base_url}${Endpoints.bookmark}`, {
            method: 'post',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: cleanedUrl,
                html: html, 
                user_id: session_user.session_user.uid
            }),
        })
        const _content = await response.json()
        return { status: response.status, content: _content }
    }
    catch (err) {
        return {status: 500, content: err}
    }
}

// Regenerate a document (this is used when the document failed to generate on the first attempt)
async function postRegenerateDocument(document){

    console.log('postRegenerateDocument -> document: ', document)
    //Fetch post with request.document
    try {
        let response = await fetch(`${base_url}${Endpoints.regenrate}`, {
            method: 'post',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(document),
        })
        
        console.log('postRegenerateDocument -> response: ', response)
        if (response.status == 202) {
            let bookmark = await response.json()
            console.log(`postRegenerateDocument accepted, seding bookmark_id ${bookmark.id} to renderDocument`)
            renderDocument(bookmark.id)
        }
    }catch (err) {
        console.log('postRegenerateDocument -> error: ', err)
    }

    
}

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

// Source: https://dev.to/ycmjason/javascript-fetch-retry-upon-failure-3p6g
async function fetch_retry(url, options, n) {
    try {
        const response = await fetch(url, options);
        console.log('fetch_retry -> attempts: ', n, ' url: ', url)
        if (response.status == 206 && n > 1) {
            await sleep(1500);
            console.log('fetch_retry -> retrying attempts: ', n, ' url: ', url)
            return fetch_retry(url, options, n - 1);
        } else if (response.status == 206 && n == 1) {
            throw new Error('Failed to fetch: ' + url);
        }
        else {
            return response.json();
        }
    } catch (error) {
        throw error;
    }
}

const searchBookmarksByUrl = async (user_id, url) => {
    // Only search if side panel is open
    if (!isSidePanelOpen) {
        console.log('Side panel is closed, skipping bookmark search');
        return { bookmark: undefined, error: null };
    }

    try {
        const cleanedUrl = cleanUrl(url);
        console.log('searchBookmarksByUrl -> url:', cleanedUrl);

        // First check local storage
        const value = await chrome.storage.local.get(["bookmarks"]);
        console.log('searchBookmarksByUrl -> local storage value:', value);

        if (value.bookmarks) {
            value.bookmarks = value.bookmarks.filter(bookmark => bookmark !== null && bookmark !== undefined);
            const found = value.bookmarks.find(bookmark => bookmark.url === cleanedUrl);
            if (found) {
                console.log('searchBookmarksByUrl -> found in local storage:', found);
                return { bookmark: found, error: null };
            }
        }

        // If not found locally, search server
        console.log('searchBookmarksByUrl -> not found in local storage, searching server');
        let response = await fetch(`${base_url}${Endpoints.user_bookmark}`, {
            method: 'post',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: cleanedUrl,
                html: "",
                user_id: user_id
            }),
        });
        
        if (response.status === 404) {
            const error = await response.json();
            console.log('searchBookmarkByUrl -> error: ', error);
            return { bookmark: undefined, error: error };
        }
        
        const data = await response.json();
        console.log('searchBookmarkByUrl -> server data: ', data);
        return { bookmark: data, error: null };
    } catch (err) {
        console.error('searchBookmarkByUrl -> error: ', err);
        return { bookmark: undefined, error: err };
    }
}




function refreshBookmarksCache(user_uid) {
    let attempts = 3
    const url = `${base_url}${Endpoints.user_bookmarks.replace('{ID}', user_uid)}`
    const options = { method: 'GET', headers: {'Accept': 'application/json','Content-Type': 'application/json',}}

    fetch_retry(url, options, attempts).then(async (bookmarks) => {
        console.log('refreshBookmarksCache -> response: ', bookmarks)
        
        // Log size information
        const bookmarksSize = JSON.stringify(bookmarks).length;
        console.log('Bookmarks array size:', bookmarks.length, 'items');
        console.log('Total JSON string size:', bookmarksSize, 'bytes');
        console.log('Average size per bookmark:', Math.round(bookmarksSize / bookmarks.length), 'bytes');
        
        // Log first few bookmarks to check their structure
        console.log('Sample bookmarks:', bookmarks.slice(0, 3));

        // First clear the storage
        await chrome.storage.local.clear()
        console.log('Storage cleared successfully')
        
        // Then store the new bookmarks
        storeBookmarks(bookmarks)
    }).catch((error) => {
        console.log('refreshBookmarksCache -> error: ', error)
        throw error
    })
}




const fetchChat = async (document_id) => {
    let attempts = 3
    const url = `${base_url}${Endpoints.chat.replace('{id}', document_id)}`
    const options = { 
        method: 'GET', 
        headers: { 
            'Accept': 'application/json', 
            'Content-Type': 'application/json',
        } 
    }
    
    try {
        console.log(`Fetching chat messages from: ${url}`);
        const response = await fetch_retry(url, options, attempts)
        // The response is now an array of chat messages
        return response
    } catch (error) {
        console.log('fetchChat -> error: ', error)
        return null
    }
}

const fetchAskQuestion = async (payload) => {

    let attempts = 3
    const url = `${base_url}${Endpoints.ask_question}`
    const options = { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', }, body: JSON.stringify(payload) }

    try {
        const response = await fetch_retry(url, options, attempts)
        return response
    } catch (error) {
        console.log('fetchAskQuestion -> error: ', error)
        return null
    }
}

const delteChatMessage = async (message_id) => {
    try {
        const url = `${base_url}${Endpoints.delete_chat_message.replace('{id}', message_id)}`
        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!res.ok) {
            throw Error('Could not fetch the data for that resource');
        }
        return true;
    } catch (err) {
        throw Error("Error deleting question answer ", err);
    }
}


// Listen from popup to fetch document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    
    if (request.name === CommunicationEnum.FETCH_CHAT) {
        console.log('background.js got message. Fetch Chat for document_id: ', request.document_id)
        fetchChat(request.document_id).then((_chat) => {
            console.log('fetchChat -> response: ', _chat)
            // Make sure we're sending a valid response
            if (_chat) {
                sendResponse({ chat: _chat, success: true })
            } else {
                sendResponse({ chat: [], success: false, error: 'Failed to fetch chat messages' })
            }
        }).catch(error => {
            console.error('Error in fetchChat:', error);
            sendResponse({ chat: [], success: false, error: error.message })
        })
        return true; // Important: return true to indicate we'll call sendResponse asynchronously
    }
    else if (request.name === CommunicationEnum.ASK_QUESTION) {
        console.log('Background message ask_question:', request.payload)
        
        fetchAskQuestion(request.payload).then((response) => {
            console.log('fetchAskQuestion response: ', response)
            sendResponse({ answer: response })    
        }).catch((error) => {
            console.log('fetchAskQuestion error: ', error)
            sendResponse({ answer: error })    
        })
        return true
    }
    else if (request.name === CommunicationEnum.DELETE_QANDA) {
        console.log('Background message delete_qanda:', request.uuid)
        
        delteChatMessage(request.uuid).then((response) => {
            console.log('deleteChat response: ', response)
            sendResponse({ deleted: response })    
        }).catch((error) => {
            console.log('deleteChat error: ', error)
            sendResponse({ deleted: error })    
        })
        return true
    }
    else if (request.name === 'highlight-citation') {
        (async () => {  // Wrap in async IIFE
            try {
                const { active_tab_id } = await chrome.storage.session.get(['active_tab_id']);
                if (!active_tab_id) {
                    console.error('No active tab ID found in storage');
                    
                    // If no active tab ID in storage, try to get the current active tab
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs && tabs.length > 0) {
                        const currentTabId = tabs[0].id;
                        console.log('Retrieved current active tab ID:', currentTabId);
                        
                        // Store it for future use
                        await chrome.storage.session.set({ active_tab_id: currentTabId });
                        
                        // Continue with this tab ID
                        await handleHighlighting(currentTabId, request.verbatim, sendResponse);
                        return;
                    }
                    
                    sendResponse({
                        success: false,
                        error: 'No active tab found'
                    });
                    return;
                }
                
                await handleHighlighting(active_tab_id, request.verbatim, sendResponse);
            } catch (error) {
                console.error('Error in highlight-citation handler:', error);
                sendResponse({
                    success: false,
                    error: error.message || 'Unknown error'
                });
            }
        })();
        return true;
    }
    else {
        console.log('background.js got message. Unknown request: ', request, " from: ", sender)
    }

    
    

})




function renderDocument(bookmark_id) {
    /*
    * Fetch document from server with a retry fetch.
    * The reason for the retry fetch is that the server may not have the document ready while
    * LLM is still processing the document.
    * Send document to side panel to render. 
    */
    
    let attempts = 30
    const url = `${base_url}${Endpoints.document_plus.replace('{ID}', bookmark_id)}`
    const options = { method: 'GET', headers: {'Accept': 'application/json','Content-Type': 'application/json',}}

    fetch_retry(url, options, attempts).then((document) => {
        console.log('getDocument -> response: ', document)
        console.timeEnd('getDocument')
        sendDocumentToSidePanel(document).then((response) => {          
            console.log('renderDocument -> response: ', response)
        })     
    })
    .catch((error) => {
        console.log('getDocument -> error: ', error)
        renderError(error)
    })
}

const renderError = (error) => {

    chrome.runtime.sendMessage({
        name: 'error-bookmarking',
        data: error,
    }).then((response) => {
        console.log('error-bookmarking response: ', response)
    })

}


async function sendDocumentToSidePanel(document) {
    
    // Send message to side panel to render bookmark
    try {
        let response = await chrome.runtime.sendMessage({
            name: 'render-document',
            data: document,
        })
        return response
    } catch (error) {
        console.log(`Render Bookmark, error sending message ${error}`)
    }
}

 
function storeBookmarks(new_bookmarks) { 
    if (!Array.isArray(new_bookmarks)) new_bookmarks = [new_bookmarks]
    
    // Clean URLs and only store essential data
    new_bookmarks = new_bookmarks.map(bookmark => {
        if (bookmark && bookmark.url) {
            // Only store essential fields
            return {
                id: bookmark.id,
                url: cleanUrl(bookmark.url),
                title: bookmark.title,
                update_at: bookmark.update_at,
                user_id: bookmark.user_id,
                filename: bookmark.filename,
                document_id: bookmark.document_id
            };
        }
        return bookmark;
    });
    
    chrome.storage.local.get(["bookmarks"]).then((value) => {
        let bkmks = value.bookmarks || [];
        // Clean URLs in existing bookmarks if needed
        bkmks = bkmks.map(bookmark => {
            if (bookmark && bookmark.url) {
                return {
                    id: bookmark.id,
                    url: cleanUrl(bookmark.url),
                    title: bookmark.title,
                    update_at: bookmark.update_at,
                    user_id: bookmark.user_id,
                    filename: bookmark.filename,
                    document_id: bookmark.document_id
                };
            }
            return bookmark;
        });
        bkmks = Array.from(new Set([...bkmks, ...new_bookmarks]));
        chrome.storage.local.set({ bookmarks: bkmks }).then(() => {
            console.log("Bookmarks storage updated", bkmks);
        });
    });  
}




const badgeOn = (tabId) => {
    chrome.action.setBadgeBackgroundColor(
        {color: 'rgba(22, 169, 32, 1)'},  // Also green
        () => { /* ... */ },
    );     
    chrome.action.setBadgeText({ text: '✔' , tabId: tabId });
}

const badgeOff = (tabId) => {
    console.log('badgeOff -> tabId: ', tabId)
    chrome.action.setBadgeText({ text: null , tabId: tabId });
}

const badgeToggle = async (tab) => {
    console.log('badgeToggle -> url: ', tab.url)
    const result = await searchBookmarksByUrl(user.value?.uid, tab.url)
    if (result.bookmark != undefined) {
        console.log('badgeToggle -> bookmark found: ', result.bookmark)
        badgeOn(tab.tabId)
    } else {
        console.log('badgeToggle -> bookmark not found')
        badgeOff(tab.tabId)
    }
}


// Detect changes in active tab
chrome.tabs.onActivated.addListener(async (tab) => { 

    console.log('tabs.onActivated', tab.tabId)
    
    // Store the active tab ID in session storage
    await chrome.storage.session.set({ active_tab_id: tab.tabId });
    console.log('Stored active tab ID in session storage:', tab.tabId);

    chrome.tabs.get(tab.tabId, async (tab) => {
        console.log('tabs.onActivated -> get tab -> url: ', tab.url)
        badgeToggle(tab)
    })

    
});


chrome.tabs.onUpdated.addListener(function (tabId , info) {
    if (info.status === 'complete') {
        
        // Store the active tab ID in session storage
        chrome.storage.session.set({ active_tab_id: tabId });
        console.log('Stored active tab ID in session storage (onUpdated):', tabId);
        
        chrome.tabs.get(tabId, async (tab) => {
            console.log('tabs.onUpdated -> get tab -> url: ', tab.url)
            badgeToggle(tab)
        })
    }
});



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { 
    if (request.name === 'server-is') {
        console.log('background.js got message. Server is')
        fetch_retry(`${base_url}/ping`, { method: 'GET', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', } }, 3)
            .then((response) => {
                registerWebSocketConnection()
                console.log('background.js got message. Server response: ', response)
                sendResponse({ status: 'up' })

            }).catch((error) => {
                console.log('background.js got message. Server error: ', error)
                sendResponse({ status: 'down' })
            })
        return true
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.name === 'check-for-bookmarks') {
        
        console.log('popup-opened -> query for active tab id:', request.tab.id, ' -> url: ', request.tab.url)
        searchBookmarksByUrl(request.tab.url).then((bookmark) => {
            if (bookmark != undefined) {
                console.log('popup-opened -> found: ', bookmark)
                sendResponse({ bookmark: bookmark })
            } else {
                console.log('popup-opened -> bookmark not found')
            }
        })
        
    }

});

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {    
        
        // Handle message from sipde panel
        if (request.name === 'bookmark-page') {
            console.log('background.js got message. Bookmark Page for url: ', request.tab.url)
                
                postBookmark(request.tab).then((result) => {
                    
                    console.log('background.js postBookmark Results: ', result.status, ' -> ', result.content)
                    sendResponse({ status: result.status , content: result.content })
                })
            return true            
        }

    });


// Add this to ensure the side panel is set as the default
chrome.runtime.onInstalled.addListener(() => {
    // Set the side panel as default for all URLs
    chrome.sidePanel.setOptions({
        path: 'index.html?sidepanel=true',
        enabled: true
    });
    
    // Initialize bookmark local storage
    chrome.storage.local.clear(function() {
        var error = chrome.runtime.lastError;
        if (error) {
            console.error(error);
        }
    });
    
    // Get the current active tab and store its ID
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            chrome.storage.session.set({ active_tab_id: tabs[0].id });
            console.log('Initial active tab ID stored:', tabs[0].id);
        }
    });
});

// Track side panel state
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel') {
        console.log('Side panel opened');
        isSidePanelOpen = true;
        
        // When side panel is opened, check bookmarks for current tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
                badgeToggle(tabs[0]);
            }
        });

        port.onDisconnect.addListener(() => {
            console.log('Side panel closed');
            isSidePanelOpen = false;
        });
    }
});

// Handle opening the side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

// Message handler for various actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    // Handle highlight-citation message
    if (message.name === 'highlight-citation') {
        (async () => {
            try {
                const { active_tab_id } = await chrome.storage.session.get(['active_tab_id']);
                
                if (!active_tab_id) {
                    console.error('No active tab ID found in storage');
                    
                    // If no active tab ID in storage, try to get the current active tab
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs && tabs.length > 0) {
                        const currentTabId = tabs[0].id;
                        console.log('Retrieved current active tab ID:', currentTabId);
                        
                        // Store it for future use
                        await chrome.storage.session.set({ active_tab_id: currentTabId });
                        
                        // Continue with this tab ID
                        await handleHighlighting(currentTabId, message.verbatim, sendResponse);
                        return;
                    }
                    
                    sendResponse({
                        success: false,
                        error: 'No active tab found'
                    });
                    return;
                }
                
                await handleHighlighting(active_tab_id, message.verbatim, sendResponse);
            } catch (error) {
                console.error('Error in highlight-citation handler:', error);
                sendResponse({
                    success: false,
                    error: error.message || 'Unknown error'
                });
            }
        })();
        
        return true; // Keep the message channel open for the async response
    }
    
    // Handle other messages...
    // ... existing message handlers ...
});

// Helper function to handle the highlighting process
async function handleHighlighting(tabId, verbatim, sendResponse) {
    try {
        // First check if the tab exists
        const tab = await chrome.tabs.get(tabId);
        if (!tab) {
            console.error('Tab not found');
            sendResponse({
                success: false,
                error: 'Tab not found'
            });
            return;
        }
        
        console.log('Injecting content script into tab:', tabId);
        
        // Try to inject the content script
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['/js/content-scripts/highlighter.js']
            });
            console.log('Content script injected successfully');
        } catch (injectionError) {
            console.error('Error injecting content script:', injectionError);
            // Continue anyway, as the script might already be there
        }
        
        // Add a small delay to ensure the script is loaded
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Sending highlight request to tab:', tabId, 'with verbatim:', verbatim);
        
        // Send the message to the content script with a timeout
        const messagePromise = new Promise((resolve) => {
            chrome.tabs.sendMessage(
                tabId, 
                { action: 'highlight', verbatim: verbatim },
                (response) => {
                    const lastError = chrome.runtime.lastError;
                    if (lastError) {
                        console.error('Error sending message to content script:', lastError);
                        resolve({ success: false, error: lastError.message });
                    } else {
                        console.log('Highlight response:', response);
                        resolve(response || { success: false, error: 'No response from content script' });
                    }
                }
            );
        });
        
        // Add a timeout to handle cases where the content script doesn't respond
        const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => {
                resolve({ success: false, error: 'Content script did not respond in time' });
            }, 2000);
        });
        
        // Wait for either the message response or the timeout
        const result = await Promise.race([messagePromise, timeoutPromise]);
        sendResponse(result);
    } catch (error) {
        console.error('Error in handleHighlighting:', error);
        sendResponse({
            success: false,
            error: error.message || 'Unknown error in highlighting process'
        });
    }
}

// Add this to your background.js to periodically check connection
setInterval(() => {
    if (!isWebSocketOpen() && user.value) {
        console.log('WebSocket connection check failed, attempting to reconnect');
        registerWebSocketConnection();
    }
}, 60000); // Check every minute

// Add this to handle extension lifecycle
chrome.runtime.onSuspend.addListener(() => {
    console.log('Extension is being suspended, cleaning up WebSocket');
    cleanupWebSocket();
});

chrome.runtime.onStartup.addListener(() => {
    console.log('Extension starting up, initializing WebSocket');
    registerWebSocketConnection();
});

// Add deleteBookmark function
const deleteBookmark = async (bookmarkId) => {
    try {
        const url = `${base_url}${Endpoints.delete_bookmark.replace('{id}', bookmarkId)}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        });
        
        if (response.status === 204) {
            console.log('Bookmark deleted successfully');
            return { success: true };
        } else {
            const error = await response.json();
            console.error('Error deleting bookmark:', error);
            return { success: false, error };
        }
    } catch (err) {
        console.error('Error deleting bookmark:', err);
        return { success: false, error: err };
    }
}

// Add message handler for delete bookmark
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.name === 'delete-bookmark') {
        console.log('Deleting bookmark:', request.bookmarkId);
        deleteBookmark(request.bookmarkId).then((result) => {
            sendResponse(result);
        });
        return true;
    }
    else if (request.name === 'update-badge') {
        console.log('Updating badge for tab:', request.tabId, 'hasBookmark:', request.hasBookmark);
        if (request.hasBookmark) {
            badgeOn(request.tabId);
        } else {
            badgeOff(request.tabId);
        }
        return true;
    }
    // ... rest of existing message handlers ...
});

// Enhance the existing commands listener or add it if not present
chrome.commands.onCommand.addListener((command) => {
    console.log('Command received:', command);
    
    // Log the command first
    logCommand(command);
    
    // Then handle specific commands as before
    if (command === 'toggle-side-panel') {
        // ... existing code ...
    }
    else if (command === 'focus-input') {
        console.log('Focus input command received');
        let needsToOpenPanel = false;
        
        // First check if the panel is already open
        try {
            // Try to send a message to check if panel is open
            chrome.runtime.sendMessage({ 
                name: 'panel-status-check'
            }).then(response => {
                console.log('Panel is already open, focusing directly');
                sendFocusMessage();
            }).catch(error => {
                console.log('Panel not open yet, opening first: ', error);
                openPanelThenFocus();
            });
        } catch (error) {
            console.log('Error checking panel status, assuming not open: ', error);
            openPanelThenFocus();
        }
    }
    // ... any other command handlers ...
});

// Helper function to send the focus message with "fresh-open" context
function sendFocusMessage() {
    chrome.runtime.sendMessage({ 
        name: 'focus-input',
        data: { 
            action: 'focus-input',
            context: 'auto',
            freshOpen: false  // Panel was already open
        }
    }).catch(err => {
        console.log('Error sending focus message: ', err);
    });
}

// Helper function to open the panel then focus
function openPanelThenFocus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            console.log('Opening side panel first');
            
            // Open the side panel with a parameter indicating it was opened via shortcut
            chrome.sidePanel.open({ 
                tabId: tabs[0].id,
                // Add a parameter to indicate this was opened via keyboard shortcut
                path: 'index.html?from_shortcut=true&sidepanel=true'
            }).then(() => {
                console.log('Side panel opened with from_shortcut param, waiting before focusing');
                
                // Use a longer delay to ensure panel is fully rendered
                setTimeout(() => {
                    chrome.runtime.sendMessage({ 
                        name: 'focus-input',
                        data: { 
                            action: 'focus-input',
                            context: 'auto',
                            freshOpen: true  // Panel was just opened
                        }
                    }).catch(err => {
                        console.log('Error sending focus message after panel open: ', err);
                        
                        // Try once more with an even longer delay
                        setTimeout(() => {
                            chrome.runtime.sendMessage({ 
                                name: 'focus-input',
                                data: { 
                                    action: 'focus-input',
                                    context: 'auto',
                                    freshOpen: true,
                                    finalAttempt: true
                                }
                            }).catch(finalErr => {
                                console.log('Final focus attempt failed: ', finalErr);
                            });
                        }, 1000);
                    });
                }, 800); // Increased from 500ms to 800ms for better reliability
            }).catch(err => {
                console.log('Error opening side panel: ', err);
            });
        }
    });
}

// Add a function to get all available commands with their shortcuts
function getAllCommands() {
    chrome.commands.getAll(commands => {
        console.log('All registered commands:', commands);
        
        // Format and log each command
        commands.forEach(cmd => {
            console.log(`Command: ${cmd.name}, Shortcut: ${cmd.shortcut || 'none'}, Description: ${cmd.description}`);
        });
    });
}

// Call this when the background script starts
getAllCommands();

// Add message handler for fetching recent shortcuts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ... existing message handlers ...
    
    // Add handler for fetching recent shortcuts
    if (message.name === 'get-recent-shortcuts') {
        sendResponse({ shortcuts: recentShortcuts });
        return true;
    }
    
    // Add handler for clearing shortcuts
    if (message.name === 'clear-shortcuts') {
        console.log('Clearing shortcuts history');
        recentShortcuts = [];
        sendResponse({ success: true });
        return true;
    }
    
    // ... rest of existing message handlers ...
});