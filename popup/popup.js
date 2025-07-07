// Preload database initialization immediately when script loads
console.log('DealMe popup script starting...');
let isPreloading = true;

// Start database initialization immediately
if (typeof dealMeDB !== 'undefined') {
  dealMeDB.ensureInitialized().then(() => {
    console.log('Database preloaded successfully');
    isPreloading = false;
  }).catch(error => {
    console.error('Database preload failed:', error);
    isPreloading = false;
  });
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM content loaded, isPreloading:', isPreloading);
  
  const actionBtn = document.getElementById('actionBtn');
  
  // Global state for filters
  window.searchState = {
    search: '',
    category: '',
    source: '',
    sortBy: 'lastSeen',
    sortOrder: 'desc'
  };
  
  // Loading state management
  window.loadingState = {
    isLoading: false,
    retryCount: 0,
    maxRetries: 3,
    isPreloaded: !isPreloading
  };
  
  actionBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getStarted'}, function(response) {
        if (chrome.runtime.lastError) {
          console.log('No content script available on this page');
          return;
        }
        console.log('Message sent to content script');
      });
    });
  });
  
  // Initialize search controls
  initializeSearchControls();
  
  // Initialize tab functionality
  initializeTabs();
  
  // Initialize chat functionality
  initializeChat();
  
  // Debug: Check what's in storage
  try {
    chrome.storage.local.get(null, (result) => {
      console.log('All storage contents:', result);
      console.log('Chrome runtime error:', chrome.runtime.lastError);
    });
  } catch (error) {
    console.error('Error accessing storage:', error);
  }
  
  // Initialize with loading state
  showLoadingState();
  
  // If already preloaded, load immediately, otherwise wait for preload
  if (window.loadingState.isPreloaded) {
    console.log('Database already preloaded, loading offers immediately');
    initializeAndLoadOffers();
  } else {
    console.log('Waiting for database preload to complete');
    waitForPreloadAndInitialize();
  }
});

async function waitForPreloadAndInitialize() {
  try {
    // Wait for preloading to complete with timeout
    let waitTime = 0;
    const maxWaitTime = 5000; // 5 seconds max wait
    
    while (isPreloading && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitTime += 100;
    }
    
    if (waitTime >= maxWaitTime) {
      console.warn('Preload timeout reached, proceeding anyway');
    }
    
    window.loadingState.isPreloaded = true;
    await initializeAndLoadOffers();
  } catch (error) {
    console.error('Error in waitForPreloadAndInitialize:', error);
    await initializeAndLoadOffers();
  }
}

async function initializeAndLoadOffers() {
  try {
    console.log('Initializing database and loading offers...');
    
    // Ensure database is ready with multiple fallbacks
    if (typeof dealMeDB === 'undefined') {
      console.warn('Database not available, attempting to reinitialize...');
      
      // Try to recreate database instance
      if (typeof DealMeDB !== 'undefined') {
        window.dealMeDB = new DealMeDB();
        console.log('Database recreated successfully');
      } else {
        throw new Error('Database class not available');
      }
    }
    
    // Ensure initialization with aggressive timeout
    const initTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database initialization timeout')), 15000)
    );
    
    await Promise.race([
      dealMeDB.ensureInitialized(),
      initTimeout
    ]);
    
    console.log('Database initialized successfully');
    
    // Load offers
    await loadSavedOffers();
  } catch (error) {
    console.error('Failed to initialize and load offers:', error);
    handleLoadingError(error);
  }
}

function showLoadingState() {
  const offersList = document.getElementById('offersList');
  offersList.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div style="
        border: 3px solid #f3f3f3;
        border-top: 3px solid #2196F3;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin 1s linear infinite;
        margin: 0 auto 15px auto;
      "></div>
      <p style="color: #666; margin: 0;">Loading your deals...</p>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
}

function handleLoadingError(error) {
  const offersList = document.getElementById('offersList');
  
  window.loadingState.retryCount++;
  
  if (window.loadingState.retryCount <= window.loadingState.maxRetries) {
    offersList.innerHTML = `
      <div style="text-align: center; padding: 30px;">
        <p style="color: #f44336; margin-bottom: 15px;">⚠️ Loading failed. Retrying... (${window.loadingState.retryCount}/${window.loadingState.maxRetries})</p>
        <div style="
          border: 3px solid #f3f3f3;
          border-top: 3px solid #f44336;
          border-radius: 50%;
          width: 25px;
          height: 25px;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        "></div>
      </div>
    `;
    
    // Retry after a delay
    setTimeout(() => {
      initializeAndLoadOffers();
    }, 2000);
  } else {
    offersList.innerHTML = `
      <div style="text-align: center; padding: 30px;">
        <p style="color: #f44336; margin-bottom: 15px;">❌ Failed to load deals after ${window.loadingState.maxRetries} attempts.</p>
        <p style="color: #666; font-size: 12px; margin-bottom: 20px;">Error: ${error.message}</p>
        <button onclick="retryLoading()" style="
          background: #2196F3;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">Retry</button>
      </div>
    `;
  }
}

function retryLoading() {
  window.loadingState.retryCount = 0;
  showLoadingState();
  initializeAndLoadOffers();
}

async function loadSavedOffers() {
  try {
    console.log('Loading saved offers with state:', window.searchState);
    window.loadingState.isLoading = true;
    
    // Verify database is available and initialized
    if (typeof dealMeDB === 'undefined') {
      throw new Error('Database not available');
    }
    
    await dealMeDB.ensureInitialized();
    
    // Parse sort parameters
    const [sortBy, sortOrder] = window.searchState.sortBy.includes('-') ? 
      window.searchState.sortBy.split('-') : [window.searchState.sortBy, 'desc'];
    
    console.log('Calling getAllOffers with options:', {
      search: window.searchState.search,
      category: window.searchState.category,
      source: window.searchState.source,
      sortBy: sortBy,
      sortOrder: sortOrder
    });
    
    const offers = await dealMeDB.getAllOffers({ 
      search: window.searchState.search,
      category: window.searchState.category,
      source: window.searchState.source,
      sortBy: sortBy,
      sortOrder: sortOrder
    });
    console.log('Loaded offers:', offers);
    
    console.log('Calling getStats...');
    const stats = await dealMeDB.getStats();
    console.log('Stats:', stats);
    
    if (!stats) {
      throw new Error('Failed to get database stats');
    }
    
    const offersList = document.getElementById('offersList');
    
    // Show search controls if there are offers
    if (stats.totalOffers > 0) {
      const searchControls = document.getElementById('searchControls');
      searchControls.style.display = 'block';
      await populateFilterOptions();
    }
    
    let offersContent;
    if (stats.totalOffers === 0) {
      offersContent = '<p>No offers saved yet. Visit an Amex offers page and click "SCRAPE ME"!</p>';
    } else if (offers.length === 0) {
      offersContent = '<div class="no-results">No deals match your search criteria. Try adjusting your filters.</div>';
    } else {
      offersContent = offers.map(offer => {
        const highlightedContent = highlightSearchTerms(offer, window.searchState.search);
        return `
          <div class="offer-item ${!offer.isActive ? 'inactive' : ''} ${offer.merchantLink ? 'clickable' : ''}" 
               ${offer.merchantLink ? `data-merchant-link="${offer.merchantLink}"` : ''}>
            <div class="offer-header">
              <h4>${highlightedContent.merchant}${offer.merchantLink ? ' 🔗' : ''}</h4>
              <div class="offer-meta">
                <span class="offer-date">${formatDate(offer.lastSeen)}</span>
                ${offer.seenCount > 1 ? `<span class="seen-count">×${offer.seenCount}</span>` : ''}
              </div>
            </div>
            <p class="discount">${highlightedContent.discount}</p>
            ${offer.description ? `<p class="description">${highlightedContent.description}</p>` : ''}
            <div class="offer-footer">
              <span class="source">Source: ${offer.source}</span>
              ${offer.expiryDate ? `<span class="expiry">Expires: ${offer.expiryDate}</span>` : ''}
              <span class="category">${highlightedContent.category}</span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    const totalResults = offers.length;
    const resultsText = window.searchState.search || window.searchState.category || window.searchState.source ?
      `${totalResults} of ${stats.totalOffers} deals` : `${stats.totalOffers} deals`;
    
    offersList.innerHTML = `
      <div class="offers-header">
        <h3>💳 Offers Database (${resultsText})</h3>
        <div class="header-actions">
          <button id="exportOffers" class="export-btn" ${offers.length === 0 ? 'disabled' : ''}>Export</button>
          <button id="clearOffers" class="clear-btn" ${stats.totalOffers === 0 ? 'disabled' : ''}>Clear All</button>
        </div>
      </div>
      <div class="stats-bar">
        <span>Active: ${stats.activeOffers}</span>
        <span>Merchants: ${stats.merchants}</span>
        <span>Categories: ${stats.categories}</span>
      </div>
      ${offersContent}
    `;
    
    // Add event listeners
    attachEventListeners();
    
    window.loadingState.isLoading = false;
    console.log('Successfully loaded offers and stats');
    
  } catch (error) {
    console.error('Error loading offers:', error);
    window.loadingState.isLoading = false;
    throw error; // Re-throw to be handled by the caller
  }
}

function highlightSearchTerms(offer, searchTerm) {
  if (!searchTerm) {
    return {
      merchant: offer.merchant || '',
      discount: offer.discount || '',
      description: offer.description || '',
      category: offer.category || ''
    };
  }
  
  const highlight = (text, term) => {
    if (!text || !term) return text || '';
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
  };
  
  return {
    merchant: highlight(offer.merchant, searchTerm),
    discount: highlight(offer.discount, searchTerm),
    description: highlight(offer.description, searchTerm),
    category: highlight(offer.category, searchTerm)
  };
}

async function populateFilterOptions() {
  try {
    const categories = await dealMeDB.getUniqueCategories();
    const sources = await dealMeDB.getUniqueSources();
    
    const categorySelect = document.getElementById('categoryFilter');
    const sourceSelect = document.getElementById('sourceFilter');
    
    // Clear existing options except "All"
    categorySelect.innerHTML = '<option value="">All Categories</option>';
    sourceSelect.innerHTML = '<option value="">All Sources</option>';
    
    // Populate categories
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      option.selected = category === window.searchState.category;
      categorySelect.appendChild(option);
    });
    
    // Populate sources
    sources.forEach(source => {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source;
      option.selected = source === window.searchState.source;
      sourceSelect.appendChild(option);
    });
    
    // Set sort filter value
    const sortSelect = document.getElementById('sortFilter');
    sortSelect.value = window.searchState.sortBy;
    
  } catch (error) {
    console.error('Error populating filter options:', error);
  }
}

function initializeSearchControls() {
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearch');
  const categoryFilter = document.getElementById('categoryFilter');
  const sourceFilter = document.getElementById('sourceFilter');
  const sortFilter = document.getElementById('sortFilter');
  const resetBtn = document.getElementById('resetFilters');
  
  // Search input with debounce
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      window.searchState.search = e.target.value;
      loadSavedOffers();
    }, 300);
  });
  
  // Clear search button
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    window.searchState.search = '';
    loadSavedOffers();
  });
  
  // Category filter
  categoryFilter.addEventListener('change', (e) => {
    window.searchState.category = e.target.value;
    loadSavedOffers();
  });
  
  // Source filter
  sourceFilter.addEventListener('change', (e) => {
    window.searchState.source = e.target.value;
    loadSavedOffers();
  });
  
  // Sort filter
  sortFilter.addEventListener('change', (e) => {
    window.searchState.sortBy = e.target.value;
    loadSavedOffers();
  });
  
  // Reset filters
  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    categoryFilter.value = '';
    sourceFilter.value = '';
    sortFilter.value = 'lastSeen-desc';
    
    window.searchState = {
      search: '',
      category: '',
      source: '',
      sortBy: 'lastSeen-desc'
    };
    
    loadSavedOffers();
  });
}

function attachEventListeners() {
  const clearBtn = document.getElementById('clearOffers');
  const exportBtn = document.getElementById('exportOffers');
  
  console.log('Clear button:', clearBtn, 'disabled:', clearBtn?.disabled);
  console.log('Export button:', exportBtn, 'disabled:', exportBtn?.disabled);
  
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      console.log('Clear button clicked');
      if (!clearBtn.disabled) {
        clearAllOffers();
      }
    });
    console.log('Clear button event listener attached');
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
      console.log('Export button clicked');
      if (!exportBtn.disabled) {
        exportOffers();
      }
    });
    console.log('Export button event listener attached');
  }
  
  // Add click event listeners for clickable offer items
  const clickableOffers = document.querySelectorAll('.offer-item.clickable');
  clickableOffers.forEach(offerElement => {
    offerElement.addEventListener('click', (e) => {
      const merchantLink = offerElement.getAttribute('data-merchant-link');
      if (merchantLink) {
        chrome.tabs.create({ url: merchantLink });
      }
    });
  });
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function clearAllOffers() {
  console.log('clearAllOffers called');
  
  try {
    console.log('Attempting to clear offers...');
    
    // Ensure database is ready
    await dealMeDB.ensureInitialized();
    
    const result = await dealMeDB.clearAllOffers();
    console.log('Clear result:', result);
    
    if (result.success) {
      console.log('Offers cleared successfully, reloading UI...');
      // Reset loading state and reload
      window.loadingState.retryCount = 0;
      showLoadingState();
      await loadSavedOffers();
      console.log('UI updated after clearing');
    } else {
      console.error('Clear failed:', result.error);
      alert('Failed to clear offers: ' + result.error);
    }
  } catch (error) {
    console.error('Error clearing offers:', error);
    alert('Failed to clear offers. Please try again.');
  }
}

async function exportOffers() {
  console.log('exportOffers called');
  try {
    console.log('Getting export data...');
    const exportData = await dealMeDB.exportData();
    console.log('Export data:', exportData);
    
    if (!exportData) {
      alert('No data to export');
      return;
    }
    
    const jsonString = JSON.stringify(exportData, null, 2);
    console.log('JSON string length:', jsonString.length);
    
    // Try using Chrome downloads API if available
    if (chrome.downloads) {
      console.log('Using Chrome downloads API...');
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      chrome.downloads.download({
        url: url,
        filename: `dealme-export-${new Date().toISOString().split('T')[0]}.json`,
        saveAs: true
      }, (downloadId) => {
        console.log('Download started:', downloadId);
        URL.revokeObjectURL(url);
      });
    } else {
      console.log('Using fallback download method...');
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `dealme-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Error exporting offers:', error);
    alert('Failed to export offers: ' + error.message);
  }
}

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // Remove active class from all tabs and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      button.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
      
      // Special handling for chat tab
      if (targetTab === 'chat') {
        setTimeout(() => {
          const chatMessages = document.getElementById('chatMessages');
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
      }
    });
  });
}

function initializeChat() {
  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendMessage');
  const chatMessages = document.getElementById('chatMessages');
  
  // Send message on button click
  sendButton.addEventListener('click', sendMessage);
  
  // Send message on Enter key
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message
    addMessage(message, 'user');
    
    // Clear input
    chatInput.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    // Simulate AI response (replace with actual AI integration later)
    setTimeout(() => {
      hideTypingIndicator();
      handleAIResponse(message);
    }, 1500);
  }
  
  function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = sender === 'user' ? '👤' : '🤖';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = `<p>${text}</p>`;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.id = 'typing-indicator';
    
    typingDiv.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }
  
  async function handleAIResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    let response = '';
    
    // Simple rule-based responses (to be replaced with actual AI)
    if (lowerMessage.includes('deal') || lowerMessage.includes('discount')) {
      const stats = await dealMeDB.getStats().catch(() => ({ totalOffers: 0 }));
      response = `I can help you find deals! You currently have ${stats.totalOffers} deals saved. Try searching for specific merchants or categories, or visit deal sites like American Express, Groupon, or Rakuten to find more.`;
    } else if (lowerMessage.includes('search') || lowerMessage.includes('find')) {
      response = `You can search your deals using the search bar in the Deals tab. Try typing a merchant name, discount percentage, or category to filter your saved offers.`;
    } else if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
      response = `I can help you with:
      
🔍 Finding and comparing deals
💳 Managing your saved offers  
🏪 Recommendations for stores
📊 Deal statistics and insights
🛒 Shopping advice

What would you like to know more about?`;
    } else if (lowerMessage.includes('save') || lowerMessage.includes('scrape')) {
      response = `To save deals, visit supported sites like American Express Offers, Groupon, Bank of America deals, or Rakuten. Look for the "SCRAPE ME" button that appears on these sites to automatically save deals to your collection.`;
    } else if (lowerMessage.includes('extension') || lowerMessage.includes('popup')) {
      response = `This extension helps you track and find the best deals! Use the Deals tab to browse your saved offers, and I'm here in the Chat tab to answer questions and provide shopping assistance.`;
    } else {
      response = `I'm here to help with deals and shopping! You can ask me about:
      
• Finding specific deals or discounts
• How to use the extension features  
• Shopping recommendations
• Deal comparisons and advice

What would you like to know?`;
    }
    
    addMessage(response, 'bot');
  }
}