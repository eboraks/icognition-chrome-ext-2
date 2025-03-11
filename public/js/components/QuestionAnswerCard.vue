<template>
    <div class="chat-message">
        <!-- User Question -->
        <div id="question" class="flex align-items-end justify-content-end mb-2">
            <div class="bg-primary border-round px-3 py-2 shadow-1 max-w-25 relative">
                <p class="m-0 text-white pb-3">{{chat?.prompt}}</p>
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
            // Try to parse the response as JSON
            const parsedResponse = JSON.parse(props.chat.response);
            
            // Check if we have citations in the new format
            if (parsedResponse.citations && parsedResponse.citations.length > 0) {
                // Get the first citation from the array
                const verbatim = parsedResponse.citations[0];
                
                try {
                    console.log('Highlighting citation:', verbatim);
                    const response = await chrome.runtime.sendMessage({
                        name: 'highlight-citation',
                        verbatim: verbatim
                    });
                    
                    showError.value = !response.success;
                    if (!response.success) {
                        console.error('Citation not found in page:', verbatim);
                    }
                } catch (error) {
                    console.error('Citation highlighting error:', error);
                    showError.value = true;
                }
                return;
            }
        } catch (e) {
            // If we can't parse the response as JSON, fall back to the old format
            console.log('Failed to parse response as JSON, falling back to old format');
        }
        
        // Fall back to the old format if we couldn't use the new format
        if (props.chat.citations && props.chat.citations.length > 0) {
            const verbatim = props.chat.citations[0].verbatims[0].verbatim_text;
            
            try {
                console.log('Highlighting citation (old format):', verbatim);
                const response = await chrome.runtime.sendMessage({
                    name: 'highlight-citation',
                    verbatim: verbatim
                });
                
                showError.value = !response.success;
                if (!response.success) {
                    console.error('Citation not found in page (old format):', verbatim);
                }
            } catch (error) {
                console.error('Citation highlighting error (old format):', error);
                showError.value = true;
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