class DealDetector {
  constructor() {
    this.currentDomain = this.getCurrentDomain();
    this.matchingOffers = [];
    this.dealButton = null;
    this.isInitialized = false;
    
    // Don't run on deal sites themselves
    if (this.isDealSite()) {
      return;
    }
    
    this.init();
  }

  getCurrentDomain() {
    const hostname = window.location.hostname.toLowerCase();
    // Remove www. prefix for better matching
    return hostname.replace(/^www\./, '');
  }

  isDealSite() {
    const dealSites = [
      'americanexpress.com',
      'groupon.com',
      'bankofamerica.com',
      'rakuten.com',
      'chrome-extension:',
      'moz-extension:'
    ];
    
    return dealSites.some(site => 
      this.currentDomain.includes(site) || 
      window.location.href.includes(site)
    );
  }

  async init() {
    try {
      await this.checkForDeals();
      this.isInitialized = true;
    } catch (error) {
      console.error('DealDetector initialization error:', error);
    }
  }

  async checkForDeals() {
    try {
      // Get all saved offers
      const allOffers = await dealMeDB.getAllOffers();
      
      // Find matching offers for current domain
      this.matchingOffers = this.findMatchingOffers(allOffers);
      
      if (this.matchingOffers.length > 0) {
        console.log(`Found ${this.matchingOffers.length} deals for ${this.currentDomain}:`, this.matchingOffers);
        this.showDealButton();
      }
    } catch (error) {
      console.error('Error checking for deals:', error);
    }
  }

  findMatchingOffers(offers) {
    const matches = [];
    const currentDomain = this.currentDomain;
    
    for (const offer of offers) {
      if (this.isOfferMatch(offer, currentDomain)) {
        matches.push(offer);
      }
    }
    
    return matches;
  }

  isOfferMatch(offer, currentDomain) {
    // Check merchant name
    if (offer.merchant) {
      const merchantLower = offer.merchant.toLowerCase();
      
      // Direct domain match
      if (currentDomain.includes(merchantLower.replace(/\s+/g, ''))) {
        return true;
      }
      
      // Check if current domain contains merchant name
      if (merchantLower.replace(/\s+/g, '').includes(currentDomain.replace(/\.(com|net|org|co|io)$/g, ''))) {
        return true;
      }
      
      // Common merchant name variations
      const merchantVariations = this.getMerchantVariations(merchantLower);
      if (merchantVariations.some(variation => currentDomain.includes(variation))) {
        return true;
      }
    }
    
    // Check merchant link if available
    if (offer.merchantLink) {
      try {
        const linkUrl = new URL(offer.merchantLink);
        const linkDomain = linkUrl.hostname.toLowerCase().replace(/^www\./, '');
        if (linkDomain === currentDomain) {
          return true;
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
    
    return false;
  }

  getMerchantVariations(merchantName) {
    const variations = [];
    const cleanName = merchantName.replace(/[^a-z0-9]/g, '');
    
    variations.push(cleanName);
    variations.push(merchantName.replace(/\s+/g, ''));
    variations.push(merchantName.replace(/\s+/g, '-'));
    
    // Add common abbreviations and variations
    const commonVariations = {
      'target': ['target'],
      'walmart': ['walmart'],
      'amazon': ['amazon', 'amzn'],
      'nike': ['nike'],
      'adidas': ['adidas'],
      'gap': ['gap'],
      'old navy': ['oldnavy'],
      'best buy': ['bestbuy'],
      'home depot': ['homedepot'],
      'bed bath beyond': ['bedbathandbeyond', 'bbby'],
      'sephora': ['sephora'],
      'ulta': ['ulta'],
      'macys': ['macys'],
      'kohls': ['kohls'],
      'jcpenney': ['jcpenney', 'jcp'],
      'nordstrom': ['nordstrom'],
      'costco': ['costco'],
      'sams club': ['samsclub'],
      'bjs': ['bjs']
    };
    
    for (const [key, values] of Object.entries(commonVariations)) {
      if (merchantName.includes(key)) {
        variations.push(...values);
      }
    }
    
    return variations;
  }

  showDealButton() {
    // Don't show if button already exists
    if (document.getElementById('dealme-deal-button')) {
      return;
    }
    
    this.dealButton = document.createElement('button');
    this.dealButton.id = 'dealme-deal-button';
    this.dealButton.innerHTML = `💳 DEAL ME (${this.matchingOffers.length})`;
    this.dealButton.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 25px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
      transition: all 0.3s ease;
      animation: dealme-pulse 2s infinite;
    `;
    
    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes dealme-pulse {
        0% { box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3); }
        50% { box-shadow: 0 4px 25px rgba(76, 175, 80, 0.6); }
        100% { box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3); }
      }
    `;
    document.head.appendChild(style);
    
    this.dealButton.addEventListener('mouseenter', () => {
      this.dealButton.style.background = 'linear-gradient(135deg, #45a049, #3d8b40)';
      this.dealButton.style.transform = 'scale(1.05)';
    });
    
    this.dealButton.addEventListener('mouseleave', () => {
      this.dealButton.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
      this.dealButton.style.transform = 'scale(1)';
    });
    
    this.dealButton.addEventListener('click', () => {
      this.showMatchingDeals();
    });
    
    document.body.appendChild(this.dealButton);
    
    // Auto-hide after 30 seconds if not interacted with
    setTimeout(() => {
      if (this.dealButton && document.body.contains(this.dealButton)) {
        this.dealButton.style.opacity = '0.7';
      }
    }, 30000);
  }

  showMatchingDeals() {
    // Remove existing modal if any
    const existingModal = document.getElementById('dealme-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'dealme-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: dealme-fadeIn 0.3s ease;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      margin: 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      animation: dealme-slideIn 0.3s ease;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 20px;
      border-radius: 12px 12px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    header.innerHTML = `
      <h2 style="margin: 0; font-size: 20px;">💳 Available Deals for ${this.currentDomain}</h2>
      <button id="dealme-close" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">×</button>
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 20px;
    `;
    
    const offersHtml = this.matchingOffers.map(offer => `
      <div style="
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
        border-left: 4px solid #4CAF50;
        transition: transform 0.2s ease;
        cursor: ${offer.merchantLink ? 'pointer' : 'default'};
      " ${offer.merchantLink ? `onclick="window.open('${offer.merchantLink}', '_blank')"` : ''}>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <h3 style="margin: 0; color: #333; font-size: 16px;">${offer.merchant}${offer.merchantLink ? ' 🔗' : ''}</h3>
          <span style="background: #4CAF50; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">${offer.source}</span>
        </div>
        <p style="color: #4CAF50; font-weight: bold; font-size: 14px; margin: 8px 0;">${offer.discount}</p>
        ${offer.description ? `<p style="color: #666; font-size: 13px; margin: 8px 0; line-height: 1.4;">${offer.description}</p>` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 12px; color: #999;">
          <span>${offer.category}</span>
          ${offer.expiryDate ? `<span style="color: #FF9800;">Expires: ${offer.expiryDate}</span>` : ''}
        </div>
      </div>
    `).join('');
    
    content.innerHTML = `
      <p style="color: #666; margin-bottom: 20px;">Found ${this.matchingOffers.length} deal${this.matchingOffers.length > 1 ? 's' : ''} for this website:</p>
      ${offersHtml}
      <div style="text-align: center; margin-top: 20px;">
        <button id="dealme-open-extension" style="
          background: #2196F3;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          margin-right: 10px;
          transition: background-color 0.3s;
        ">Open Full Extension</button>
        <button onclick="document.getElementById('dealme-modal').remove()" style="
          background: #999;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        ">Close</button>
      </div>
    `;
    
    // Add animations
    const animationStyle = document.createElement('style');
    animationStyle.textContent = `
      @keyframes dealme-fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes dealme-slideIn {
        from { transform: translateY(-50px) scale(0.9); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(animationStyle);
    
    modalContent.appendChild(header);
    modalContent.appendChild(content);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Open Full Extension button functionality
    document.getElementById('dealme-open-extension').addEventListener('click', async (e) => {
      const button = e.target;
      const originalText = button.textContent;
      
      try {
        button.textContent = 'Opening...';
        button.style.background = '#1976D2';
        button.disabled = true;
        
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({action: 'openExtension'}, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
        
        // Chrome doesn't allow programmatic popup opening, so we guide the user
        button.textContent = '👆 Click Extension Icon';
        button.style.background = '#FF9800';
        button.style.fontSize = '12px';
        button.style.padding = '10px 15px';
        
        // Show enhanced instruction with animation
        const instruction = document.createElement('div');
        instruction.style.cssText = `
          margin-top: 15px;
          padding: 12px;
          background: linear-gradient(135deg, #E3F2FD, #BBDEFB);
          border: 2px solid #2196F3;
          border-radius: 8px;
          font-size: 13px;
          color: #1565C0;
          text-align: center;
          animation: dealme-pulse 2s infinite;
          box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
        `;
        instruction.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 5px;">🎯 Extension Icon is Highlighted!</div>
          <div>Look for the DealMe icon with a green exclamation mark (!) in your browser toolbar and click it to view all your deals</div>
        `;
        button.parentNode.appendChild(instruction);
        
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '#2196F3';
          button.style.fontSize = '14px';
          button.style.padding = '10px 20px';
          button.disabled = false;
          if (instruction.parentNode) {
            instruction.remove();
          }
        }, 8000);
      } catch (error) {
        console.error('Error opening extension:', error);
        button.textContent = 'Failed to open';
        button.style.background = '#f44336';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '#2196F3';
          button.disabled = false;
        }, 2000);
      }
    });
    
    // Close button functionality
    document.getElementById('dealme-close').addEventListener('click', () => {
      modal.remove();
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => new DealDetector(), 1000);
  });
} else {
  setTimeout(() => new DealDetector(), 1000);
}