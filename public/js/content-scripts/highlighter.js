// Check if script is already loaded
if (typeof window.iCognitionHighlighter === 'undefined') {
    // Create a namespace for our highlighter
    window.iCognitionHighlighter = {
        currentHighlights: [],
        
        removeExistingHighlights() {
            console.debug('Removing existing highlights:', this.currentHighlights.length);
            // First remove all highlights we've tracked
            this.currentHighlights.forEach(highlight => {
                const parent = highlight.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                    parent.normalize();
                }
            });
            
            // Also find and remove any of our highlights that might have been missed
            const allHighlights = document.querySelectorAll('mark.icognition-highlight');  // Only select our highlights
            allHighlights.forEach(highlight => {
                const parent = highlight.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextContent(highlight.textContent), highlight);
                    parent.normalize();
                }
            });
            
            this.currentHighlights = [];
        },

        getTextNodes() {
            const textNodes = [];
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        if (!node.textContent.trim() || 
                            node.parentElement.tagName === 'SCRIPT' || 
                            node.parentElement.style.display === 'none') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                },
                false
            );

            let node;
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }
            return textNodes;
        },

        highlightNode(node, start, end) {
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            
            const highlight = document.createElement('mark');
            highlight.className = 'icognition-highlight';  // Add our specific class
            highlight.style.backgroundColor = '#ffeb3b';
            highlight.style.color = 'black';
            
            try {
                range.surroundContents(highlight);
                this.currentHighlights.push(highlight);
                return true;
            } catch (e) {
                console.error('Error highlighting node:', e);
                return false;
            }
        },

        highlightText(verbatim) {
            console.debug('Starting highlight process for verbatim:', verbatim);
            this.removeExistingHighlights();
            
            const textNodes = this.getTextNodes();
            console.debug('Found text nodes:', textNodes.length);

            // First try exact match in single node
            for (let node of textNodes) {
                const index = node.textContent.indexOf(verbatim);
                if (index >= 0) {
                    const highlighted = this.highlightNode(node, index, index + verbatim.length);
                    if (highlighted) {
                        node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        return true;
                    }
                }
            }

            // If no exact match, split into meaningful chunks and find each
            const parts = verbatim.split('.')
                .map(part => part.trim())
                .filter(part => part.split(' ').length >= 3); // Only keep parts with 3+ words

            if (parts.length === 0) return false;

            console.debug('Searching for parts:', parts);
            let foundAny = false;

            // Search for each part in all nodes
            textNodes.forEach(node => {
                parts.forEach(part => {
                    const index = node.textContent.indexOf(part);
                    if (index >= 0) {
                        const highlighted = this.highlightNode(node, index, index + part.length);
                        if (highlighted) {
                            if (!foundAny) {
                                node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                foundAny = true;
                            }
                        }
                    }
                });
            });

            return foundAny;
        }
    };

    // Set up message listener only once
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.debug('Content script received:', request);
        if (request.action === 'highlight') {
            try {
                const found = window.iCognitionHighlighter.highlightText(request.verbatim);
                console.debug('Highlight result:', found);
                sendResponse({ success: found });
            } catch (error) {
                console.error('Highlighting error:', error);
                sendResponse({ success: false, error: error.message });
            }
        }
        return true;
    });
}
