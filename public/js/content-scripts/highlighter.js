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
    
    // Get all text nodes in the document
    const textNodes = [];
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let node;
    while (node = walker.nextNode()) {
        if (node.textContent.trim()) {
            textNodes.push(node);
        }
    }

    // Combine text content to search for the verbatim
    let combinedText = '';
    const nodePositions = [];
    textNodes.forEach(node => {
        nodePositions.push({
            start: combinedText.length,
            node: node
        });
        combinedText += node.textContent;
    });

    // Find the verbatim in the combined text
    const verbatimIndex = combinedText.indexOf(verbatim);
    if (verbatimIndex === -1) return false;

    // Find which nodes contain our text
    const verbatimEnd = verbatimIndex + verbatim.length;
    const relevantNodes = nodePositions.filter(pos => {
        const nodeStart = pos.start;
        const nodeEnd = nodeStart + pos.node.textContent.length;
        return (nodeStart < verbatimEnd && nodeEnd > verbatimIndex);
    });

    // Highlight each relevant node
    relevantNodes.forEach((pos, index) => {
        const node = pos.node;
        const nodeStart = pos.start;
        const nodeText = node.textContent;
        
        // Calculate the start and end positions within this node
        const startInNode = Math.max(0, verbatimIndex - nodeStart);
        const endInNode = Math.min(nodeText.length, verbatimEnd - nodeStart);
        
        if (startInNode < endInNode) {
            const range = document.createRange();
            range.setStart(node, startInNode);
            range.setEnd(node, endInNode);
            
            const highlight = document.createElement('mark');
            highlight.style.backgroundColor = '#ffeb3b';
            highlight.style.color = 'black';
            
            try {
                range.surroundContents(highlight);
                currentHighlights.push(highlight);
                
                // Only scroll to the first highlight
                if (index === 0) {
                    highlight.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            } catch (e) {
                console.error('Error highlighting node:', e);
            }
        }
    });

    return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.debug('Content script received:', request);
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
