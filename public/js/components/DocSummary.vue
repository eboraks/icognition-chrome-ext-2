<template>
    <div class="chat-container">
        <!-- Add the chat-messages class to the container -->
        <div class="chat-messages">
            <!-- Q&A Cards section - scrollable -->
            <div id="q&a_cards" class="qa-content">
                <ScrollPanel ref="scrollPanel" class="custom-scrollbar">
                    <div v-if="chatMessages.length > 0">
                        <div v-for="item in chatMessages" :key="item.id || index" class="chat-message mb-1">
                            <QuestionAnswerCard 
                                :chat="item" 
                                :uuid="item.id || index" 
                                @remove="handleQandARemove" 
                                @typing="handleTyping"
                                @typing-progress="handleTypingProgress"
                                typingSpeedPreset="medium"/>
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
import { ref, onMounted, watch, nextTick, computed, onUnmounted } from 'vue'
import QuestionAnswerCard from './QuestionAnswerCard.vue'
import { CommunicationEnum } from '../composables/utils.js'
import ScrollPanel from 'primevue/scrollpanel'
import Skeleton from 'primevue/skeleton'

const question = ref('')
const processing_question = ref(false)
const ask_question_input = ref(null)
const scrollPanel = ref(null)
const isActiveTyping = ref(false)
const typingScrollInterval = ref(null)

// Define the props - now accepting chat instead of doc
const props = defineProps({
  chat: {
    type: Array,
    default: () => []
  }
})

// We'll use a computed property to handle the case where chat might be null
const chatMessages = computed(() => {
    // Ensure we always return an array, even if props.chat is null or undefined
    const result = Array.isArray(props.chat) ? props.chat : [];
    console.log('DocSummary -> chatMessages computed property called, result:', result);
    return result;
})

console.log('DocSummary -> chatMessages:', chatMessages.value)

onMounted(() => {
    console.log('DocSummary -> component mounted, chatMessages:', chatMessages.value);
    // Scroll to bottom when component is mounted
    nextTick(() => {
        setTimeout(() => {
            scrollToBottom();
        }, 100);
    });
})

// Handle typing events from QuestionAnswerCard components
const handleTyping = (isTyping) => {
    console.log('DocSummary -> handleTyping:', isTyping);
    isActiveTyping.value = isTyping;
    
    // If typing has started, set up continuous scrolling
    if (isTyping) {
        // Clear any existing interval
        if (typingScrollInterval.value) {
            clearInterval(typingScrollInterval.value);
        }
        
        // Set up a new interval to scroll periodically during typing
        typingScrollInterval.value = setInterval(() => {
            if (isActiveTyping.value) {
                scrollToBottom(false); // Use auto scrolling during typing for better performance
            }
        }, 200); // Adjust frequency as needed
    } else {
        // If typing has stopped, clear the interval and do a final scroll
        if (typingScrollInterval.value) {
            clearInterval(typingScrollInterval.value);
            typingScrollInterval.value = null;
        }
        
        // Final scroll when typing is complete, with a small delay to ensure content is fully rendered
        setTimeout(() => {
            scrollToBottom(true);
            
            // Additional scroll after a longer delay to ensure stability
            setTimeout(() => {
                // Final auto scroll to ensure we're at the bottom
                scrollToBottom(false);
                
                // Release scroll control to the user
                const scrollPanel = document.querySelector('.p-scrollpanel-wrapper');
                if (scrollPanel) {
                    scrollPanel.style.pointerEvents = 'auto';
                }
            }, 350);
        }, 50);
    }
}

// Handle typing progress events for more precise scrolling
const handleTypingProgress = (progress) => {
    // Scroll on significant progress 
    if (progress.progress > 0.2 && !progress.isComplete) {
        scrollToBottom(false); // Use auto scrolling during typing for better performance
    }
    
    // Final smooth scroll when complete
    if (progress.isComplete) {
        scrollToBottom(true);
        
        // Release scroll control after a delay
        setTimeout(() => {
            const scrollPanel = document.querySelector('.p-scrollpanel-wrapper');
            if (scrollPanel) {
                scrollPanel.style.pointerEvents = 'auto';
            }
        }, 300);
    }
}

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

    if (request.name === CommunicationEnum.CHAT_READY) {
        console.log('DocSummary -> CHAT_READY message received:', request.data);
    }

    if (request.name === CommunicationEnum.CHAT_MESSAGE) {
        console.log('DocSummary -> new chat message:', request)
        const newChat = JSON.parse(request.data);
        // Emit an event to add the new chat item
        emit('add-chat-item', newChat);
        nextTick(() => {
            setTimeout(() => {
                scrollToBottom(true);
            }, 100);
        });
    }
})

// Improved scrollToBottom function to prevent jittering
const scrollToBottom = (smooth = true) => {
    if (scrollPanel.value) {
        nextTick(() => {
            const content = scrollPanel.value.$el.querySelector('.p-scrollpanel-content');
            const wrapper = scrollPanel.value.$el.querySelector('.p-scrollpanel-wrapper');
            
            if (content && wrapper) {
                // Calculate the scroll position needed to see the bottom
                const scrollPosition = content.scrollHeight - wrapper.clientHeight;
                
                try {
                    // Use the scrollPanel's built-in scroll method with the appropriate behavior
                    wrapper.scrollTo({
                        top: scrollPosition,
                        behavior: smooth ? 'smooth' : 'auto'
                    });
                    
                    // If we're using smooth scrolling, temporarily disable pointer events
                    // to prevent user interactions during the scroll animation
                    if (smooth) {
                        wrapper.style.pointerEvents = 'none';
                        
                        // Re-enable pointer events after the animation completes
                        setTimeout(() => {
                            wrapper.style.pointerEvents = 'auto';
                        }, 300); // Match the default smooth scroll duration
                    }
                } catch (e) {
                    console.error('Error with wrapper.scrollTo:', e);
                    // Fallback to direct scrollTop assignment
                    wrapper.scrollTop = scrollPosition;
                }
                
                // Backup: try to find the last message and scroll to it
                if (smooth) {
                    const allMessages = content.querySelectorAll('.chat-message');
                    if (allMessages.length > 0) {
                        const lastQuestion = allMessages[allMessages.length - 1];
                        if (lastQuestion) {
                            lastQuestion.scrollIntoView({ 
                                behavior: smooth ? 'smooth' : 'auto', 
                                block: 'end',
                                inline: 'nearest'
                            });
                        }
                    }
                }
            }
        });
    }
}

// Clean up the interval when the component is unmounted
onUnmounted(() => {
    if (typingScrollInterval.value) {
        clearInterval(typingScrollInterval.value);
        typingScrollInterval.value = null;
    }
});

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