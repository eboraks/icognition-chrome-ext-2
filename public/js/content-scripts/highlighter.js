let currentHighlights = [];

console.debug('Highlighter content script loaded');

function removeExistingHighlights() {
    currentHighlights.forEach(highlight => {
        const parent = highlight.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize();
        }
    });
    currentHighlights = [];
}

function highlightText(verbatim) {
    removeExistingHighlights();
    
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        const index = node.textContent.indexOf(verbatim);
        if (index >= 0) {
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + verbatim.length);
            
            const highlight = document.createElement('mark');
            highlight.style.backgroundColor = '#ffeb3b';
            highlight.style.color = 'black';
            
            range.surroundContents(highlight);
            currentHighlights.push(highlight);
            
            highlight.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            
            return true;
        }
    }
    return false;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.debug('Content script received:', request)
    if (request.action === 'highlight') {
        try {
            const found = highlightText(request.verbatim);
            sendResponse({ success: found });
        } catch (error) {
            console.error('Highlighting error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }
    return true;
});
