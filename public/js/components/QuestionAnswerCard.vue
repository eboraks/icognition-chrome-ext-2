<template>
    <div class="chat-message">
        <!-- User Question -->
        <div id="question" class="flex align-items-end justify-content-end mb-2">
            <div class="bg-primary border-round px-3 py-2 shadow-1 max-w-25 relative">
                <p class="m-0 text-white pb-3">{{chat?.user_prompt}}</p>
                <small class="timestamp text-50">
                    {{moment(chat?.created_at).format('h:mm a')}}
                </small>
            </div>
        </div>
        
        <!-- AI Response -->
        <div class="flex align-items-start">
            <Avatar image="./icons/icog_action_icon_32x32.png" class="mr-2" />
            <div class="surface-card border-round px-3 py-2 shadow-1 max-w-25 relative">
                <div v-if="chat?.response == null" class="flex align-items-center">
                    <i class="pi pi-spin pi-spinner mr-2"></i>
                    <span>Thinking...</span>
                </div>
                <div v-else>
                    <p v-if="is_answer_include_html" class="m-0 cursor-pointer" v-html="formattedResponse" @click="handleCitationClick"></p>
                    <p v-else class="m-0 cursor-pointer" @click="handleCitationClick">
                        {{formattedResponse}}
                        <i v-if="showError" class="pi pi-exclamation-circle text-red-500 ml-2" 
                           title="Citation not found in page"></i>
                    </p>
                    <small class="absolute bottom-0 right-0 text-500 p-1">
                        <i class="pi pi-times cursor-pointer" @click="handleQandARemove(uuid)"></i>
                    </small>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="js">
    import moment from 'moment';
    import { computed, nextTick, ref } from 'vue';
    import Avatar from 'primevue/avatar';

    const props = defineProps({ chat: { type: Object, required: true }, uuid: { type: String, required: true } });
    
    // Computed function to format the response based on the new format
    const formattedResponse = computed(() => {
        if (!props.chat?.response) return '';
        
        try {
            // Try to parse the response as JSON
            const parsedResponse = JSON.parse(props.chat.response);
            console.log('QuestionAnswerCard -> parsedResponse:', parsedResponse)
            
            // Check if it has the new format with summary_for_chat
            if (parsedResponse.answer_for_chat) {
                return parsedResponse.answer_for_chat;
            }
            
            // If it has important_bullet_points, format them as a list
            if (parsedResponse.important_bullet_points && parsedResponse.important_bullet_points.length > 0) {
                const bulletPoints = parsedResponse.important_bullet_points
                    .map(point => `<li>${point}</li>`)
                    .join('');
                return `${parsedResponse.answer_for_chat || ''}<ul>${bulletPoints}</ul>`;
            }
            
            // Fallback to the original response if we can't parse it properly
            return props.chat.response;
        } catch (e) {
            // If it's not valid JSON, just return the original response
            return props.chat.response;
        }
    });
    
    //Computed function to format the answer, if the string include html tags then it will be rendered as html
    const is_answer_include_html = computed(() => {
        if (!formattedResponse.value) {
            return false;
        }
        
        // Check for common HTML tags or entities
        const htmlRegex = /<\/?(?:div|span|p|a|ul|ol|li|h[1-6]|br|hr|img|b|i|strong|em|table|tr|td|th|thead|tbody)(?:\s+[^>]*)?>/i;
        
        return htmlRegex.test(formattedResponse.value); 
    })

    const emit = defineEmits(['remove']);
    const handleQandARemove = (uuid) => {
        //call backend to remove the QandA and only then remove it from the UI
        console.log('Card -> Removing QandA:', uuid);

        emit('remove', uuid);
    }

    const showError = ref(false);

    const handleCitationClick = async () => {
        try {
            // Show loading state
            showError.value = false;
            const loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'citation-loading';
            loadingIndicator.style.position = 'fixed';
            loadingIndicator.style.top = '10px';
            loadingIndicator.style.right = '10px';
            loadingIndicator.style.padding = '8px 12px';
            loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            loadingIndicator.style.color = 'white';
            loadingIndicator.style.borderRadius = '4px';
            loadingIndicator.style.zIndex = '9999';
            loadingIndicator.textContent = 'Finding citation...';
            document.body.appendChild(loadingIndicator);
            
            let verbatim = '';
            let allCitations = [];
            
            // Try to parse the response as JSON
            try {
                const parsedResponse = JSON.parse(props.chat.response);
                console.log('Parsed response for citations:', parsedResponse);
                
                // Check if we have citations in the new format
                if (parsedResponse.text_used_for_answer && parsedResponse.text_used_for_answer.length > 0) {
                    // Get all citations from the array
                    allCitations = parsedResponse.text_used_for_answer;
                    verbatim = allCitations[0];
                }
            } catch (e) {
                console.log('Failed to parse response as JSON, falling back to old format:', e);
            }
            
            // Fall back to the old format if we couldn't use the new format
            if (allCitations.length === 0 && props.chat.citations && props.chat.citations.length > 0) {
                props.chat.citations.forEach(citation => {
                    if (citation.verbatims && citation.verbatims.length > 0) {
                        citation.verbatims.forEach(v => {
                            if (v.verbatim_text) {
                                allCitations.push(v.verbatim_text);
                            }
                        });
                    }
                });
                
                if (allCitations.length > 0) {
                    verbatim = allCitations[0];
                }
            }
            
            if (!verbatim) {
                console.error('No citation text found');
                showError.value = true;
                
                // Show error notification
                const errorNotification = document.createElement('div');
                errorNotification.style.position = 'fixed';
                errorNotification.style.top = '10px';
                errorNotification.style.right = '10px';
                errorNotification.style.padding = '8px 12px';
                errorNotification.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
                errorNotification.style.color = 'white';
                errorNotification.style.borderRadius = '4px';
                errorNotification.style.zIndex = '9999';
                errorNotification.textContent = 'No citation text found in the response';
                
                document.body.appendChild(errorNotification);
                setTimeout(() => {
                    document.body.removeChild(errorNotification);
                }, 3000);
                
                if (document.getElementById('citation-loading')) {
                    document.body.removeChild(loadingIndicator);
                }
                return;
            }
            
            console.log('Highlighting citation:', verbatim);
            console.log('All available citations:', allCitations);
            
            // Try to highlight the first citation
            let success = false;
            let attemptCount = 0;
            
            // Try each citation until one works or we run out
            while (!success && attemptCount < allCitations.length) {
                try {
                    const currentVerbatim = allCitations[attemptCount];
                    console.log(`Attempt ${attemptCount + 1}/${allCitations.length}: Highlighting citation:`, currentVerbatim);
                    
                    const response = await chrome.runtime.sendMessage({
                        name: 'highlight-citation',
                        verbatim: currentVerbatim
                    });
                    
                    console.log('Highlight response:', response);
                    
                    if (response && response.success) {
                        success = true;
                        break;
                    }
                    
                    attemptCount++;
                } catch (error) {
                    console.error(`Error in highlight attempt ${attemptCount + 1}:`, error);
                    attemptCount++;
                }
            }
            
            if (!success) {
                showError.value = true;
                console.error('Failed to highlight any citations after trying all options');
                
                // Create a notification with the citation text
                const errorNotification = document.createElement('div');
                errorNotification.style.position = 'fixed';
                errorNotification.style.top = '10px';
                errorNotification.style.right = '10px';
                errorNotification.style.padding = '12px 16px';
                errorNotification.style.backgroundColor = 'rgba(220, 53, 69, 0.9)';
                errorNotification.style.color = 'white';
                errorNotification.style.borderRadius = '4px';
                errorNotification.style.zIndex = '9999';
                errorNotification.style.maxWidth = '80%';
                errorNotification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
                
                // Create a container for the citation text
                const citationContainer = document.createElement('div');
                citationContainer.style.marginTop = '8px';
                citationContainer.style.padding = '8px';
                citationContainer.style.backgroundColor = 'rgba(255,255,255,0.9)';
                citationContainer.style.color = '#333';
                citationContainer.style.borderRadius = '4px';
                citationContainer.style.maxHeight = '150px';
                citationContainer.style.overflow = 'auto';
                citationContainer.style.fontSize = '14px';
                citationContainer.style.lineHeight = '1.4';
                citationContainer.textContent = verbatim;
                
                errorNotification.innerHTML = '<div>Citation not found in page. You can search for this text:</div>';
                errorNotification.appendChild(citationContainer);
                
                // Add a close button
                const closeButton = document.createElement('div');
                closeButton.innerHTML = '&times;';
                closeButton.style.position = 'absolute';
                closeButton.style.top = '8px';
                closeButton.style.right = '8px';
                closeButton.style.cursor = 'pointer';
                closeButton.style.fontSize = '16px';
                closeButton.style.fontWeight = 'bold';
                closeButton.onclick = () => document.body.removeChild(errorNotification);
                
                errorNotification.appendChild(closeButton);
                document.body.appendChild(errorNotification);
                
                // Auto-dismiss after 10 seconds
                setTimeout(() => {
                    if (document.body.contains(errorNotification)) {
                        document.body.removeChild(errorNotification);
                    }
                }, 10000);
            }
        } catch (error) {
            console.error('Error in handleCitationClick:', error);
            showError.value = true;
        } finally {
            // Remove loading indicator
            if (document.getElementById('citation-loading')) {
                document.body.removeChild(document.getElementById('citation-loading'));
            }
        }
    };
</script>

<style scoped>
.chat-message {
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
    margin-left: 0.5rem;
    margin-right: 1.5rem;
}

.max-w-25 {
    max-width: 85%;
}

/* Remove previous styles */
div[icon="pi pi-times"] {
    cursor: pointer;
    font-weight: bold;
    padding: 8px;
    transition: color 0.2s;
}

div[icon="pi pi-times"]:hover {
    color: #dc3545;
}

.content-wrapper {
    padding: 0.5rem;
    margin: 0;
}

.answer-text {
    margin: 0;
    line-height: 1.4;
}

/* Make sure the Card content has minimal padding */
:deep(.p-card-content) {
    padding: 0 !important;
}

.header-wrapper {
    padding: 0.5rem;
    margin: 0;
}

.header-text {
    margin: 0;
    padding: 0;
    line-height: 1.4;
}

/* Override PrimeVue's default header padding */
:deep(.p-card-header) {
    padding: 0 !important;
}

.timestamp {
    position: absolute;
    bottom: 2px;
    right: 8px;
    font-size: 0.75rem;
    line-height: 1;
}

/* Add padding to ensure text doesn't overlap with timestamp */
.chat-message p {
    padding-right: 3rem;
}

.cursor-pointer {
    cursor: pointer;
}
</style>