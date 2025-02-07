<template>
    <div class="chat-message">
        <!-- User Question -->
        <div id="question" class="flex align-items-end justify-content-end mb-2">
            <div class="bg-primary border-round px-3 py-2 shadow-1 max-w-25 relative">
                <p class="m-0 text-white pb-3">{{qanda?.question}}</p>
                <small class="timestamp text-50">
                    {{moment(qanda?.created_at).format('h:mm a')}}
                </small>
            </div>
        </div>
        
        <!-- AI Response -->
        <div class="flex align-items-start">
            <Avatar image="./icons/icog_action_icon_32x32.png" class="mr-2" />
            <div class="surface-card border-round px-3 py-2 shadow-1 max-w-25 relative">
                <div v-if="qanda?.status == null" class="flex align-items-center">
                    <i class="pi pi-spin pi-spinner mr-2"></i>
                    <span>Thinking...</span>
                </div>
                <div v-else>
                    <p v-if="is_answer_include_html" class="m-0 cursor-pointer" v-html="qanda?.answer" @click="handleCitationClick"></p>
                    <p v-else class="m-0 cursor-pointer" @click="handleCitationClick">
                        {{qanda?.answer}}
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

    const props = defineProps({ qanda: { type: Object, required: true }, uuid: { type: String, required: true } });
    
    //Computed fuction to format the answer, if the string include html tags then it will be rendered as html
    const is_answer_include_html = computed(() => {
        if (props.qanda?.answer === undefined) {
            return false;
        } else {
            return props.qanda.answer.includes('<');
        }
    })

    const emit = defineEmits(['remove']);
    const handleQandARemove = (uuid) => {
        //call backend to remove the QandA and only then remove it from the UI
        console.log('Card -> Removing QandA:', uuid);

        emit('remove', uuid);
    }

    const showError = ref(false);

    const handleCitationClick = async () => {
        if (!props.qanda.citations || props.qanda.citations.length === 0) return;
        
        const verbatim = props.qanda.citations[0].verbatims[0].verbatim_text;
        
        try {
            const response = await chrome.runtime.sendMessage({
                name: 'highlight-citation',
                verbatim: verbatim
            });
            
            showError.value = !response.success;
        } catch (error) {
            console.error('Citation highlighting error:', error);
            showError.value = true;
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