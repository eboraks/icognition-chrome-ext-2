<template>
    <div class="panel">
        <p class="flex text-xs justify-content-end">{{moment(qanda?.created_at).format('DD MMM YYYY h:mm a')}}</p>
        <div class="card">
            <Card class="border-1 border-round border-300 bg-white shadow-3">
                <template #header>
                    <div class="header-wrapper border-1 border-round border-300 surface-300 flex border-bottom-1 border-noround-bottom border-top-none border-left-none border-right-none">
                        <p class="header-text flex-grow-1 text-sm border-round font-semibold">{{qanda?.question}}</p>
                        <div icon="pi pi-times" 
                            class="bg-transparent border-transparent border-0 flex-shrink-0 text-black-alpha-90" 
                            size="small" aria-label="Close" @click="handleQandARemove(uuid)">x</div>
                    </div>
                </template>
                <template #content>
                    <div v-if="qanda?.status == null" class="content-wrapper">
                        <div>Loading...</div>
                    </div>
                    <div class="content-wrapper bg-white">
                        <p v-if="is_answer_include_html" class="answer-text" v-html="qanda?.answer"></p>
                        <p v-else class="answer-text">{{qanda?.answer}}</p>
                    </div>
                </template>
            </Card>
        </div>
    </div>
</template>

<script setup lang="js">
    import moment from 'moment';
    import { computed } from 'vue';


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
    
    
</script>
<style scoped>
    /* Create a style for X button for removing a card */
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

</style>