<template>
    <div>
        <TabView class="h-full" @tab-change="tabClick">

            <TabPanel header="Summary">
                <div v-if="doc == null && doc.tld == null" class="pr-3 py-3" style="height: calc(100% - 49.6px);">
                    <Skeleton class='mb-2'></Skeleton>
                    <Skeleton width="5rem" class='mb-2'></Skeleton>
                </div>

                <div v-else class="flex-columnw-full border-round border-2 border-blue-100 bg-white p-2">
                    <div class="overflow-y-auto" style="height: calc(100% - 49.6px);">
                    <p class="line-height-2" v-if="doc != null && doc.is_about != null">{{ doc.is_about }}</p>
                    <div v-if="doc != null && doc.tldr != null">
                        <p class="pl-1">Key Points:</p>
                        <ul>
                        <li v-for="item in doc.tldr" :key="item">{{ item }}</li>
                        </ul>
                    </div>
                    </div>
                </div>
            </TabPanel>
            <TabPanel header="Ask iCognition">

                <div v-if="!qanda?.length">
                    <div class="mb-3" v-for="n in 3" :key="n">
                        <Skeleton height="100px" class="mb-2 w-full"/>
                    </div>
                </div>
                <div class="chat-container">
                    <!-- Q&A Cards section - scrollable -->
                    <div id="q&a_cards" class="qa-content">
                        <ScrollPanel ref="scrollPanel" class="custom-scrollbar">
                            <div v-if="qanda?.length">
                                <div v-for="item in qanda" :key="item.id" class="mb-1">
                                    <QuestionAnswerCard :qanda="item" :uuid="item.uuid" @remove="handleQandARemove"/>
                                </div>
                            </div>
                        </ScrollPanel>
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
            </TabPanel>
        </TabView>
    </div>
</template>
<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import QuestionAnswerCard from './QuestionAnswerCard.vue'
import { CommunicationEnum } from '../composables/utils.js'
import ScrollPanel from 'primevue/scrollpanel'
import Skeleton from 'primevue/skeleton'
// testing save
const qanda = ref(null)
const qanda_status = ref(null)
const question = ref('')
const processing_question = ref(false)
const ask_question_input = ref(null)
const scrollPanel = ref(null)

// Define the props
const props = defineProps({
  doc: {
    type: Object,
    required: true
    }
})


onMounted(() => {
    console.log('DocSummary -> onMounted:', props.doc)
    qanda_status.value = 'loading'
    chrome.runtime.sendMessage({ name: CommunicationEnum.FETCH_QANDA, document_id: props.doc.id }).then((response) => {
        console.log('DocSummary -> fetch-qanda response:', response)
        qanda.value = response.qanda
        qanda_status.value = 'ready' 
    })
})

const tabClick = (event) => {
    console.log('DocSummary -> tabAskClick', event)

    //Click on the Ask tab, scroll to the input
    if (event.index === 1) {
        //Sleep for 1 second to allow the tab to be rendered
        setTimeout(() => {
            scrollToBottom()
        }, 600)
    }
    
}

const handleQandARemove = (uuid) => {
        //call backend to remove the QandA and only then remove it from the UI
        console.log('DocSummary -> Removing QandA:', uuid);

        //Send chrome message to remove the QandA
        chrome.runtime.sendMessage({ name: CommunicationEnum.DELETE_QANDA, uuid: uuid }, function (response) {
            console.log('handle QandA Delete Response:', response);
            if (response.deleted === true) {
                qanda.value = qanda.value.filter(item => item.uuid !== uuid)
                ask_question_input.value.scrollIntoView({ behavior: 'smooth', block: 'end' })    
            }
            
        });

    }


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    console.log('DocSummary -> onMessage:', request.name)

    if (request.name === CommunicationEnum.NEW_QANDA) {
        console.log('DocSummary -> new qanda:', request)
        qanda_status.value = 'ready'
        qanda.value = JSON.parse(request.data)
        console.log('DocSummary -> qanda:', qanda.value)
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
    console.log('DocSummary -> handleAsk:', question.value)

    const _payload = {
        question: question.value,
        document_id: props.doc.id
    }
    processing_question.value = true
    chrome.runtime.sendMessage({ name: CommunicationEnum.ASK_QANDA, payload: _payload }).then((response) => {
        console.log('DocSummary -> ask-qanda response:', response.answer)
        qanda.value.push(response.answer)
        processing_question.value = false
        question.value = ''
        nextTick(() => {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        });
    })
}

</script>
<style scoped>
.qa-container {
    position: relative;
    height: calc(100vh - 150px);
    display: flex;
    flex-direction: column;
}

.qa-list {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 70px; /* Make space for input container */
}

.input-container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: white;
    border-top: 1px solid #ddd;
    padding: 8px;
}

:deep(.p-scrollpanel) {
    height: 100%;
}

:deep(.p-scrollpanel-content) {
    padding-bottom: 1rem;
}

.chat-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 130px);
    position: relative;
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

:deep(.p-scrollpanel-content) {
    padding: 0.5rem;
}

:deep(.p-scrollpanel-wrapper) {
    .p-scrollpanel-bar {
        background-color: #64748B !important; /* Tailwind's gray-500 or adjust to your preferred shade */
        opacity: 0.6;
        
        &:hover {
            background-color: #475569 !important; /* Darker on hover (gray-600) */
            opacity: 0.8;
        }
    }
}

/* Custom scrollbar styles */
:deep(.custom-scrollbar) {
    .p-scrollpanel-bar {
        background-color: #64748B;
    }

    .p-scrollpanel-bar-y {
        opacity: 0.6;
        width: 0.6rem;
    }

    .p-scrollpanel-bar-x {
        display: none;
    }
}

/* Hide default scrollbar */
:deep(.p-scrollpanel-content) {
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
        display: none;
    }
}
</style>