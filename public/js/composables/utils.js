async function storeBookmark(url) { 
    chrome.storage.local.get(["bookmarks"]).then((value) => {
        let bookmarks = value.bookmarks
        bookmarks.push(url)
        chrome.storage.local.set({ bookmarks: bookmarks }).then(() => {});
    });
}

async function getStoreBookmarks() { 
    chrome.storage.local.get(["bookmarks"]).then((value) => {
        return value.bookmarks
    });
}

export function caspitalFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}


export const CommunicationEnum = {
    NEW_DOC: "new-doc",
    NEW_QANDA: "new-qanda",
    CHAT_MESSAGE: "chat-message",
    DOC_IN_PROGRESS: "doc-in-progress",
    ADD_BOOKMARK: "add-bookmark",
    ASK_QUESTION: "ask-question",
    FETCH_QANDA: "fetch-qanda",
    ASK_QUESTION: "ask-question",
    DELETE_QANDA: "delete-qanda",
    PROGRESS_PERCENTAGE: "progress_percentage",
    FETCH_DOCUMENT: "fetch-document",
    FETCH_CHAT: "fetch-chat",
    CHAT_READY: "chat-ready",
    CHAT_NOT_READY: "chat-not-ready",
    ERROR: "error",
    SUGGESTED_QUESTIONS: 'suggested-questions',
};

export function cleanUrl(url) {
    url = decodeURIComponent(url);
    // Define the regex
    const pageRegex = /(http.*:\/\/[a-zA-Z0-9:\/\.\-\@\%\_]*)/;

    // Match the regex against the URL
    const matches = url.match(pageRegex);

    // Get the first match
    let cleanUrl;
    if (matches) {
        cleanUrl = matches[0];
    } else {
        // If no match, use the URL as the page URL
        cleanUrl = url;
    }

    return cleanUrl;
}
