import './styles.css';
import './app';

const root = document.querySelector('#app');
if (root) {
    root.appendChild(document.createElement('goal-tracker-app'));
}
