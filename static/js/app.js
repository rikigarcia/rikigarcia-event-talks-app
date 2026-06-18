// State Management
let releasesStore = [];
let activeCategory = 'all';
let searchTimeout = null;

// DOM Elements
const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    searchInput: document.getElementById('search-input'),
    categoryFilters: document.getElementById('category-filters'),
    skeletonLoader: document.getElementById('skeleton-loader'),
    feedContainer: document.getElementById('feed-container'),
    noResults: document.getElementById('no-results'),
    cacheStatusContainer: document.getElementById('cache-status-container'),
    cacheBadge: document.getElementById('cache-badge'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    
    // Modal
    tweetModal: document.getElementById('tweet-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    tweetContextDate: document.getElementById('tweet-context-date'),
    tweetContextType: document.getElementById('tweet-context-type'),
    tweetContextText: document.getElementById('tweet-context-text'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    progressCircle: document.getElementById('progress-circle'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    shareTweetBtn: document.getElementById('share-tweet-btn'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchReleases();
    setupEventListeners();
});

// Theme Logic
function initTheme() {
    elements.themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 
                             (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('color-scheme', newTheme);
        document.querySelector('meta[name="color-scheme"]').content = newTheme;
    });

    // Sync theme with system changes if user has not explicitly set a preference
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('color-scheme')) {
            const systemTheme = e.matches ? 'dark' : 'light';
            document.querySelector('meta[name="color-scheme"]').content = systemTheme;
        }
    });
}

// Event Listeners Setup
function setupEventListeners() {
    // Refresh Feed
    elements.refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search input (debounced to avoid re-rendering on every keypress)
    elements.searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderFeed();
        }, 200);
    });

    // Category Filter Selection
    elements.categoryFilters.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('.filter-btn');
        if (!targetBtn) return;

        // Toggle Active Class
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        targetBtn.classList.add('active');

        activeCategory = targetBtn.dataset.category;
        renderFeed();
    });

    // Modal Events
    elements.closeModalBtn.addEventListener('click', hideTweetModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) hideTweetModal();
    });
    
    // Live Character Counter & Progress Circle
    elements.tweetTextarea.addEventListener('input', updateCharCount);

    // Share & Copy inside Modal
    elements.copyTweetBtn.addEventListener('click', copyTweetContent);
    elements.shareTweetBtn.addEventListener('click', shareOnTwitter);

    // Escape Key to Close Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.tweetModal.classList.contains('hidden')) {
            hideTweetModal();
        }
    });
}

// Fetch Releases from Flask API
async function fetchReleases(forceRefresh = false) {
    // Show Loading Spinner & Skeleton Screen
    elements.refreshBtn.classList.add('spinning');
    elements.refreshBtn.disabled = true;
    elements.skeletonLoader.classList.remove('hidden');
    elements.feedContainer.classList.add('hidden');
    elements.noResults.classList.add('hidden');

    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        releasesStore = result.releases;
        
        // Update Meta Info Header
        updateMetaInfo(result.source, result.last_updated);
        
        // Render results
        renderFeed();
        
        if (forceRefresh) {
            showToast('Feed refreshed successfully!');
        }
    } catch (error) {
        console.error('Failed to fetch release notes:', error);
        showToast('Error: Failed to fetch release notes.');
        
        // If we have cached data locally, show it. Otherwise show no results
        if (releasesStore.length === 0) {
            elements.noResults.classList.remove('hidden');
        } else {
            renderFeed();
        }
    } finally {
        // Hide Loading State
        elements.refreshBtn.classList.remove('spinning');
        elements.refreshBtn.disabled = false;
        elements.skeletonLoader.classList.add('hidden');
        elements.feedContainer.classList.remove('hidden');
    }
}

// Update App Header Status (Badge & Time)
function updateMetaInfo(source, timestamp) {
    // Update Source Badge (Live vs Cached)
    if (source === 'live') {
        elements.cacheBadge.textContent = 'Live';
        elements.cacheBadge.className = 'badge badge-cache';
        elements.cacheBadge.style.background = 'var(--badge-feature-bg)';
        elements.cacheBadge.style.color = 'var(--badge-feature-text)';
    } else {
        elements.cacheBadge.textContent = 'Cached';
        elements.cacheBadge.className = 'badge badge-cache';
        elements.cacheBadge.style.background = 'var(--color-primary-glass)';
        elements.cacheBadge.style.color = 'var(--color-primary)';
    }

    // Format Timestamp
    const date = new Date(timestamp * 1000);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateString = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    elements.lastUpdatedText.textContent = `Updated: ${dateString} at ${timeString}`;
}

// Filter and Render Feed Cards
function renderFeed() {
    const searchQuery = elements.searchInput.value.trim().toLowerCase();
    
    // Clear Container
    elements.feedContainer.innerHTML = '';
    let renderedCount = 0;

    releasesStore.forEach(release => {
        // Filter updates inside the daily release
        const filteredUpdates = release.updates.filter(update => {
            // 1. Category Filter
            if (activeCategory !== 'all' && update.category !== activeCategory) {
                return false;
            }

            // 2. Search Query Filter
            if (searchQuery) {
                const textMatch = update.text.toLowerCase().includes(searchQuery);
                const typeMatch = update.type.toLowerCase().includes(searchQuery);
                const dateMatch = release.date.toLowerCase().includes(searchQuery);
                return textMatch || typeMatch || dateMatch;
            }

            return true;
        });

        // Skip rendering this group card if no updates match
        if (filteredUpdates.length === 0) {
            return;
        }

        renderedCount += filteredUpdates.length;

        // Render Group Card
        const groupCard = document.createElement('div');
        groupCard.className = 'release-group-card';
        
        // Header
        const headerHTML = `
            <div class="group-header">
                <h2 class="group-date">${release.date}</h2>
                <a href="${release.link}" target="_blank" class="group-link" rel="noopener noreferrer">
                    Official Notes
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"></path>
                    </svg>
                </a>
            </div>
        `;
        
        // Updates List
        let updatesHTML = '<div class="group-updates">';
        filteredUpdates.forEach((update, idx) => {
            // We use standard HTML content provided by feed, safely styled via CSS
            updatesHTML += `
                <article class="update-item" data-id="${release.id}-${idx}">
                    <div class="update-header">
                        <span class="update-type-badge ${update.category}">${update.type}</span>
                    </div>
                    <div class="update-body">
                        ${update.html}
                    </div>
                    <div class="update-actions">
                        <button class="btn btn-twitter btn-tweet-action" data-date="${release.date}" data-type="${update.type}" data-category="${update.category}" data-link="${release.link}">
                            <span class="btn-icon-label">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                                </svg>
                            </span>
                            Share Update
                        </button>
                    </div>
                </article>
            `;
        });
        updatesHTML += '</div>';

        groupCard.innerHTML = headerHTML + updatesHTML;
        elements.feedContainer.appendChild(groupCard);
    });

    // Handle Empty Results State
    if (renderedCount === 0) {
        elements.feedContainer.classList.add('hidden');
        elements.noResults.classList.remove('hidden');
    } else {
        elements.feedContainer.classList.remove('hidden');
        elements.noResults.classList.add('hidden');
    }

    // Attach Event Listeners to dynamic Tweet Buttons
    document.querySelectorAll('.btn-tweet-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const updateItem = e.currentTarget.closest('.update-item');
            const date = e.currentTarget.dataset.date;
            const type = e.currentTarget.dataset.type;
            const category = e.currentTarget.dataset.category;
            const link = e.currentTarget.dataset.link;
            
            // Get raw text from body
            const bodyText = updateItem.querySelector('.update-body').innerText.trim();
            
            showTweetModal(date, type, category, bodyText, link);
        });
    });
}

// Modal Show Logic
function showTweetModal(date, type, category, text, link) {
    elements.tweetContextDate.textContent = date;
    elements.tweetContextType.textContent = type;
    elements.tweetContextType.className = `tweet-context-type badge ${category}`;
    elements.tweetContextText.textContent = text;
    
    // Auto-generate Tweet Content
    // Twitter link counts as 23 characters. We should leave space for it
    // Format: "Google Cloud #BigQuery Update (June 17, 2026) [Type]: '[text...]' #GoogleCloud [Link]"
    const header = `Google Cloud #BigQuery Update (${date}) [${type}]: "`;
    const footer = `..." #GoogleCloud ${link}`;
    
    // Max text length in tweet = 280 - header length - footer length
    const allowedLength = 280 - header.length - footer.length;
    let snippet = text;
    if (snippet.length > allowedLength) {
        // Truncate to word boundary if possible
        snippet = snippet.substring(0, allowedLength);
        const lastSpace = snippet.lastIndexOf(' ');
        if (lastSpace > 0) {
            snippet = snippet.substring(0, lastSpace);
        }
    }
    
    const tweetText = `${header}${snippet}${footer}`;
    elements.tweetTextarea.value = tweetText;
    
    // Open Modal
    elements.tweetModal.classList.remove('hidden');
    elements.tweetModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Lock background scroll
    
    // Focus Editor & Select
    elements.tweetTextarea.focus();
    updateCharCount();
}

function hideTweetModal() {
    elements.tweetModal.classList.add('hidden');
    elements.tweetModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = ''; // Unlock background scroll
}

// Live Character Counter & SVG Progress Circle update
function updateCharCount() {
    const text = elements.tweetTextarea.value;
    
    // URL in Twitter counts as exactly 23 characters. 
    // We search for the URL in the text and adjust character count accordingly.
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];
    
    let textLengthWithoutUrls = text.replace(urlRegex, '').length;
    let computedLength = textLengthWithoutUrls + (urls.length * 23);
    
    const remaining = 280 - computedLength;
    elements.charCounter.textContent = remaining;
    
    // Update colors based on remaining characters
    if (remaining < 0) {
        elements.charCounter.className = 'char-counter danger';
        elements.shareTweetBtn.disabled = true;
    } else if (remaining <= 20) {
        elements.charCounter.className = 'char-counter warning';
        elements.shareTweetBtn.disabled = false;
    } else {
        elements.charCounter.className = 'char-counter';
        elements.shareTweetBtn.disabled = false;
    }

    // Update Progress Ring (Radius: 10, Circumference: 62.83)
    const circle = elements.progressCircle;
    const circumference = 2 * Math.PI * 10;
    
    const percentage = Math.min(Math.max((computedLength / 280) * 100, 0), 100);
    const offset = circumference - (percentage / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Ring Color transitions
    if (remaining < 0) {
        circle.style.stroke = 'var(--badge-issue-text)';
    } else if (remaining <= 20) {
        circle.style.stroke = 'var(--badge-deprecation-text)';
    } else {
        circle.style.stroke = 'var(--color-primary)';
    }
}

// Copy Tweet Content to Clipboard
async function copyTweetContent() {
    try {
        await navigator.clipboard.writeText(elements.tweetTextarea.value);
        showToast('Tweet copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showToast('Error: Failed to copy to clipboard.');
    }
}

// Redirect to Twitter Intent
function shareOnTwitter() {
    const text = encodeURIComponent(elements.tweetTextarea.value);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${text}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
}

// Notification Toast Alert
function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.remove('hidden');
    // Force a repaint
    elements.toast.offsetHeight;
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
        setTimeout(() => {
            elements.toast.classList.add('hidden');
        }, 300);
    }, 3000);
}
