document.addEventListener('DOMContentLoaded', function() {
  const actionBtn = document.getElementById('actionBtn');
  
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
  
  // Debug: Check what's in storage
  try {
    chrome.storage.local.get(null, (result) => {
      console.log('All storage contents:', result);
      console.log('Chrome runtime error:', chrome.runtime.lastError);
    });
  } catch (error) {
    console.error('Error accessing storage:', error);
  }
  
  loadSavedOffers();
});

async function loadSavedOffers() {
  try {
    console.log('Loading saved offers...');
    const offers = await dealMeDB.getAllOffers({ 
      sortBy: 'merchant', 
      sortOrder: 'asc' 
    });
    console.log('Loaded offers:', offers);
    const stats = await dealMeDB.getStats();
    console.log('Stats:', stats);
    const offersList = document.getElementById('offersList');
    
    const offersContent = offers.length === 0 ? 
      '<p>No offers saved yet. Visit an Amex offers page and click "SCRAPE ME"!</p>' :
      offers.map(offer => `
        <div class="offer-item ${!offer.isActive ? 'inactive' : ''} ${offer.merchantLink ? 'clickable' : ''}" 
             ${offer.merchantLink ? `data-merchant-link="${offer.merchantLink}"` : ''}>
          <div class="offer-header">
            <h4>${offer.merchant}${offer.merchantLink ? ' 🔗' : ''}</h4>
            <div class="offer-meta">
              <span class="offer-date">${formatDate(offer.lastSeen)}</span>
              ${offer.seenCount > 1 ? `<span class="seen-count">×${offer.seenCount}</span>` : ''}
            </div>
          </div>
          <p class="discount">${offer.discount}</p>
          ${offer.description ? `<p class="description">${offer.description}</p>` : ''}
          <div class="offer-footer">
            <span class="source">Source: ${offer.source}</span>
            ${offer.expiryDate ? `<span class="expiry">Expires: ${offer.expiryDate}</span>` : ''}
            <span class="category">${offer.category}</span>
          </div>
        </div>
      `).join('');
    
    offersList.innerHTML = `
      <div class="offers-header">
        <h3>💳 Offers Database (${stats.totalOffers})</h3>
        <div class="header-actions">
          <button id="exportOffers" class="export-btn" ${offers.length === 0 ? 'disabled' : ''}>Export</button>
          <button id="clearOffers" class="clear-btn" ${offers.length === 0 ? 'disabled' : ''}>Clear All</button>
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
    
  } catch (error) {
    console.error('Error loading offers:', error);
    document.getElementById('offersList').innerHTML = '<p>Error loading offers. Please try again.</p>';
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function clearAllOffers() {
  console.log('clearAllOffers called');
  
  // Skip confirm dialog for now - it might be causing issues in popup
  console.log('Attempting to clear offers...');
  try {
    const result = await dealMeDB.clearAllOffers();
    console.log('Clear result:', result);
    if (result.success) {
      console.log('Offers cleared successfully, reloading UI...');
      // Reload the offers list to show empty state
      await loadSavedOffers();
      console.log('UI updated after clearing');
    } else {
      console.error('Clear failed:', result.error);
      console.log('Failed to clear offers: ' + result.error);
    }
  } catch (error) {
    console.error('Error clearing offers:', error);
    console.log('Failed to clear offers. Please try again.');
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