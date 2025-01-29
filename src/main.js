import { createApp } from 'vue';
import App from './App.vue';
import PrimeVue from 'primevue/config';
import 'primevue/resources/themes/lara-light-blue/theme.css'; // Import Lara theme CSS
import 'primevue/resources/primevue.min.css'; // Import PrimeVue CSS
import 'primeicons/primeicons.css'; // Import PrimeIcons CSS
import 'primeflex/primeflex.css'; // Import PrimeFlex CSS
import Button from 'primevue/button';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import ProgressBar from 'primevue/progressbar';
import Skeleton from 'primevue/skeleton';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import ScrollPanel from 'primevue/scrollpanel';

const app = createApp(App);
app.use(PrimeVue);
app.component('Button', Button);
app.component('TabView', TabView);
app.component('TabPanel', TabPanel);
app.component('ProgressBar', ProgressBar);
app.component('Skeleton', Skeleton);
app.component('Card', Card);
app.component('InputText', InputText);
app.component('ScrollPanel', ScrollPanel);
app.mount('#app');
