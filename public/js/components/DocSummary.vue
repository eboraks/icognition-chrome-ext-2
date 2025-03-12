<template>
    <div class="chat-container">
        <!-- Add the chat-messages class to the container -->
        <div class="chat-messages">
            <!-- Q&A Cards section - scrollable -->
            <div id="q&a_cards" class="qa-content">
                <ScrollPanel ref="scrollPanel" class="custom-scrollbar">
                    <div v-if="chatMessages.length">
                        <div v-for="item in chatMessages" :key="item.id" class="chat-message mb-1">
                            <QuestionAnswerCard :chat="item" :uuid="item.id" @remove="handleQandARemove"/>
                        </div>
                    </div>
                    <div v-else class="mb-3">
                        <div class="mb-3" v-for="n in 3" :key="n">
                            <Skeleton height="100px" class="mb-2 w-full"/>
                        </div>
                    </div>
                </ScrollPanel>
            </div>
        </div>
        
        <!-- Ask section - fixed at bottom -->
        <div id="ask" class="ask-input">
            <div v-if="processing_question">
                <ProgressBar mode="indeterminate" class="h-1rem" />
            </div>
            <div v-else ref="ask_question_input" class="flex gap-2">
                <InputText @keyup.enter="handleAsk" 
                         class="flex-grow-1" 
                         type="text" 
                         v-model="question" 
                         placeholder="Ask about this document..." />
                <Button @click="handleAsk" 
                        icon="pi pi-send"
                        class="p-button-rounded" />
            </div>
        </div>
    </div>
</template>
<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import QuestionAnswerCard from './QuestionAnswerCard.vue'
import { CommunicationEnum } from '../composables/utils.js'
import ScrollPanel from 'primevue/scrollpanel'
import Skeleton from 'primevue/skeleton'

const question = ref('')
const processing_question = ref(false)
const ask_question_input = ref(null)
const scrollPanel = ref(null)

// Define the props - now accepting chat instead of doc
const props = defineProps({
  chat: {
    type: Array,
    default: () => []
  }
})

// We'll use a computed property to handle the case where chat might be null
const chatMessages = computed(() => props.chat || [])

onMounted(() => {
    // Scroll to bottom when component is mounted
    nextTick(() => {
        setTimeout(() => {
            scrollToBottom();
        }, 100);
    });
})

const handleQandARemove = (uuid) => {
    //call backend to remove the QandA and only then remove it from the UI
    console.log('DocSummary -> Removing QandA:', uuid);

    //Send chrome message to remove the QandA
    chrome.runtime.sendMessage({ name: CommunicationEnum.DELETE_QANDA, uuid: uuid }, function (response) {
        console.log('handle QandA Delete Response:', response);
        if (response.deleted === true) {
            // We can't modify the props directly, so we'll emit an event to the parent
            emit('remove-chat-item', uuid);
            ask_question_input.value.scrollIntoView({ behavior: 'smooth', block: 'end' })    
        }
    });
}

// Add emit for removing chat items
const emit = defineEmits(['remove-chat-item', 'add-chat-item']);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('DocSummary -> onMessage:', request.name)

    if (request.name === CommunicationEnum.CHAT_MESSAGE) {
        console.log('DocSummary -> new chat message:', request)
        const newChat = JSON.parse(request.data);
        // Emit an event to add the new chat item
        emit('add-chat-item', newChat);
        nextTick(() => {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        });
    }
})

const scrollToBottom = () => {
    if (scrollPanel.value) {
        nextTick(() => {
            const content = scrollPanel.value.$el.querySelector('.p-scrollpanel-content');
            const allMessages = content.querySelectorAll('.chat-message');
            const lastQuestion = allMessages[allMessages.length - 1];
            
            if (lastQuestion) {
                lastQuestion.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'end',
                    inline: 'nearest'
                });
            }
        });
    }
}

const handleAsk = () => {
    if (!question.value.trim()) return;
    
    console.log('DocSummary -> handleAsk:', question.value)

    // Try to get document_id from the first chat message
    let document_id = null;
    
    if (props.chat && props.chat.length > 0) {
        // First try to get it from document_id 
        document_id = props.chat[0].chat_id;
        
    }
    
    if (!document_id) {
        console.error('No document_id found in chat messages');
        return;
    }
    
    const _payload = {
        question: question.value,
        document_id: document_id
    }
    console.log('DocSummary -> asking question payload:', _payload)
    processing_question.value = true
    chrome.runtime.sendMessage({ name: CommunicationEnum.ASK_QUESTION, payload: _payload }).then((response) => {
        console.log('DocSummary -> asking question response:', response.answer)
        // Emit an event to add the new chat item
        emit('add-chat-item', response.answer);
        processing_question.value = false
        question.value = ''
        nextTick(() => {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        });
    }).catch(error => {
        console.error('Error asking question:', error);
        processing_question.value = false;
    });
}
</script>
<style scoped>
/* Add these styles to ensure proper chat display */
.chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
}

.chat-message {
    max-width: 95%;
    margin-left: auto;
    margin-right: auto;
    margin-bottom: 0.75rem;
}

.qa-content {
    flex: 1;
    overflow: hidden;
    padding-right: 0.5rem;
    margin-bottom: 60px; /* Height of the ask-input */
}

.ask-input {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: white;
    padding: 0.5rem;
    border-top: 1px solid #dee2e6;
    height: 60px;
    z-index: 1;
}

:deep(.p-scrollpanel) {
    width: 100%;
    height: 100%;
}

:deep(.custom-scrollbar) {
    height: calc(100vh - 190px);
}
</style>