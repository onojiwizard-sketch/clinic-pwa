// app.js - Common JavaScript for all pages
const API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL'; // Replace with your deployed web app URL

class HospitalApp {
    constructor() {
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.setupServiceWorker();
        this.setupInstallPrompt();
        this.updateLastUpdated();
    }

    setupEventListeners() {
        // Menu toggle
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        
        if (menuToggle && navMenu) {
            menuToggle.addEventListener('click', () => {
                navMenu.classList.toggle('active');
            });
        }

        // Close menu when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !e.target.closest('.nav-menu') && 
                !e.target.closest('.menu-toggle') &&
                navMenu) {
                navMenu.classList.remove('active');
            }
        });
    }

    async loadData() {
        // This will be overridden by each page
        console.log('Loading data...');
    }

    async fetchFromAPI(endpoint, params = {}) {
        try {
            const url = new URL(API_URL);
            Object.keys(params).forEach(key => 
                url.searchParams.append(key, params[key])
            );
            
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            if (!data.success) throw new Error(data.message);
            
            return data.data;
        } catch (error) {
            console.error('API Error:', error);
            this.showError(`Failed to load data: ${error.message}`);
            return [];
        }
    }

    showError(message) {
        // Create error toast
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f8d7da;
            color: #721c24;
            padding: 15px 20px;
            border-radius: 5px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 5000);
    }

    showLoading(container) {
        if (container) {
            container.innerHTML = '<div class="loading">Loading...</div>';
        }
    }

    updateLastUpdated() {
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) {
            lastUpdated.textContent = new Date().toLocaleString();
        }
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('service-worker.js')
                    .then(registration => {
                        console.log('ServiceWorker registered:', registration);
                    })
                    .catch(error => {
                        console.log('ServiceWorker registration failed:', error);
                    });
            });
        }
    }

    setupInstallPrompt() {
        let deferredPrompt;
        const installBtn = document.getElementById('install-btn');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            if (installBtn) {
                installBtn.style.display = 'flex';
                installBtn.addEventListener('click', async () => {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`User response to the install prompt: ${outcome}`);
                    deferredPrompt = null;
                    installBtn.style.display = 'none';
                });
            }
        });

        window.addEventListener('appinstalled', () => {
            console.log('PWA installed');
            if (installBtn) installBtn.style.display = 'none';
            deferredPrompt = null;
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-NG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-NG', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Home page specific functions
class HomePage extends HospitalApp {
    async loadData() {
        await Promise.all([
            this.loadStats(),
            this.loadTodaySchedule(),
            this.loadOnCallToday()
        ]);
    }

    async loadStats() {
        try {
            const [doctors, clinics, roster, notifications] = await Promise.all([
                this.fetchFromAPI('', { operation: 'getDoctors' }),
                this.fetchFromAPI('', { operation: 'getClinics' }),
                this.fetchFromAPI('', { 
                    operation: 'getRoster',
                    date: new Date().toISOString().split('T')[0]
                }),
                this.fetchFromAPI('', { sheet: 'Notifications' })
            ]);

            document.getElementById('doctor-count').textContent = doctors?.length || 0;
            document.getElementById('clinic-count').textContent = clinics?.length || 0;
            document.getElementById('roster-count').textContent = roster?.length || 0;
            
            const pendingNotifications = notifications?.filter(n => 
                n.Status === 'Pending'
            ).length || 0;
            document.getElementById('notification-count').textContent = pendingNotifications;
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadTodaySchedule() {
        const container = document.getElementById('today-schedule');
        this.showLoading(container);

        try {
            const today = new Date().toISOString().split('T')[0];
            const schedule = await this.fetchFromAPI('', { 
                operation: 'getRoster',
                date: today
            });

            if (schedule.length === 0) {
                container.innerHTML = '<div class="no-data">No schedule for today</div>';
                return;
            }

            container.innerHTML = schedule.map(item => `
                <div class="schedule-item">
                    <div class="schedule-info">
                        <h4>${item.Clinic}</h4>
                        <p>${item.Consultants?.split(',').slice(0, 2).join(', ')}...</p>
                    </div>
                    <span class="status-badge ${item.Status === 'Sent' ? 'badge-sent' : 'badge-pending'}">
                        ${item.Status || 'Pending'}
                    </span>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<div class="error">Failed to load schedule</div>';
        }
    }

    async loadOnCallToday() {
        const container = document.getElementById('on-call-today');
        this.showLoading(container);

        try {
            const callRoster = await this.fetchFromAPI('', { sheet: 'CallRoster' });
            const today = new Date().toISOString().split('T')[0];
            
            const todayOnCall = callRoster.filter(item => {
                const itemDate = new Date(item.Date).toISOString().split('T')[0];
                return itemDate === today;
            });

            if (todayOnCall.length === 0) {
                container.innerHTML = '<div class="no-data">No on-call duty today</div>';
                return;
            }

            container.innerHTML = todayOnCall.map(item => `
                <div class="call-item">
                    <div class="call-info">
                        <h4>${item.ConsultantOnCall}</h4>
                        <p>Team: ${item.SeniorRegistrarOnCall}, ${item.RegistrarOnCall}</p>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<div class="error">Failed to load on-call data</div>';
        }
    }
}

// Global refresh function
async function refreshData() {
    const app = window.currentApp || new HomePage();
    await app.loadData();
    app.updateLastUpdated();
    
    // Show refresh confirmation
    const toast = document.createElement('div');
    toast.textContent = 'Data refreshed successfully!';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--success-color);
        color: white;
        padding: 10px 20px;
        border-radius: var(--border-radius);
        z-index: 10000;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Initialize app based on current page
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    switch (path) {
        case '/':
        case '/index.html':
            window.currentApp = new HomePage();
            break;
        // Other page initializations will be added
        default:
            window.currentApp = new HospitalApp();
    }
});
