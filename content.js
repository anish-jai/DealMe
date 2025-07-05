function isAmexOffersPage() {
  const url = window.location.href;
  return url.includes('global.americanexpress.com/offers/eligible');
}

function createScrapeButton() {
  if (document.getElementById('dealme-scrape-button')) return;
  
  const button = document.createElement('button');
  button.id = 'dealme-scrape-button';
  button.innerHTML = '🔍 SCRAPE ME';
  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #007FFF;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transition: all 0.3s ease;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.background = '#0056CC';
    button.style.transform = 'scale(1.05)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.background = '#007FFF';
    button.style.transform = 'scale(1)';
  });
  
  button.addEventListener('click', () => scrapeAmexOffers());
  
  document.body.appendChild(button);
}

function scrapeAmexOffers() {
  console.log('Starting Amex offers scraping...');
  
  const offers = [];
  const offerElements = document.querySelectorAll('[data-locator-id="merchantOffer"]');
  
  offerElements.forEach((element, index) => {
    try {
      const offer = {
        id: `amex-${Date.now()}-${index}`,
        source: 'American Express',
        merchant: extractMerchantName(element),
        discount: extractDiscountText(element),
        description: extractDescription(element),
        expiryDate: extractExpiryDate(element),
        category: extractCategory(element),
        scrapedAt: new Date().toISOString(),
        url: window.location.href
      };
      
      if (offer.merchant && offer.discount) {
        offers.push(offer);
      }
    } catch (error) {
      console.error('Error parsing offer element:', error);
    }
  });
  
  if (offers.length > 0) {
    saveOffers(offers).then(result => {
      showSuccessMessage(result.newOffers, result.updatedOffers);
    }).catch(error => {
      console.error('Error saving offers:', error);
      showErrorMessage('Failed to save offers');
    });
  } else {
    showNoOffersMessage();
  }
}

function extractMerchantName(element) {
  const merchantEl = element.querySelector('.offer-info p.dls-gray-05');
  if (merchantEl && merchantEl.textContent.trim()) {
    return merchantEl.textContent.trim();
  }
  
  const altEl = element.querySelector('img[alt]');
  if (altEl && altEl.alt) {
    return altEl.alt.replace(' - New Card Offer', '').trim();
  }
  
  return element.textContent.split('\n')[0]?.trim() || 'Unknown Merchant';
}

function extractDiscountText(element) {
  const discountEl = element.querySelector('.offer-info p.heading-2');
  if (discountEl && discountEl.textContent.trim()) {
    return discountEl.textContent.trim();
  }
  
  const discountPatterns = [
    /Earn \d+% back on .+, up to a total of \$\d+/i,
    /Earn \+\d+ Membership Rewards® points .+, up to \d+,?\d* pts/i,
    /(\d+)%\s*back/i,
    /\$(\d+)\s*off/i,
    /save\s*\$(\d+)/i,
    /(\d+)x\s*points/i
  ];
  
  const text = element.textContent;
  
  for (const pattern of discountPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return text.split('\n').find(line => 
    line.includes('%') || line.includes('$') || line.includes('points')
  )?.trim() || 'Discount available';
}

function extractDescription(element) {
  const descEl = element.querySelector('.description, .offer-description, .details');
  return descEl ? descEl.textContent.trim() : element.textContent.slice(0, 100) + '...';
}

function extractExpiryDate(element) {
  const expiryEl = element.querySelector('[data-testid="expirationDate"]');
  if (expiryEl) {
    return expiryEl.textContent.trim();
  }
  
  const dateMatch = element.textContent.match(/expires?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  return dateMatch ? dateMatch[1] : null;
}

function extractCategory(element) {
  const categoryEl = element.querySelector('.category, .offer-category');
  return categoryEl ? categoryEl.textContent.trim() : 'General';
}

async function saveOffers(offers) {
  try {
    const results = await dealMeDB.addOffers(offers);
    const newOffers = results.filter(r => r.success && r.type === 'created').length;
    const updatedOffers = results.filter(r => r.success && r.type === 'updated').length;
    
    console.log(`Offers processed: ${newOffers} new, ${updatedOffers} updated`);
    
    chrome.storage.local.set({
      last_scrape: new Date().toISOString()
    }, () => {
      console.log('Scrape timestamp updated');
    });
    
    return { newOffers, updatedOffers };
  } catch (error) {
    console.error('Error saving offers:', error);
    throw error;
  }
}

function showSuccessMessage(newOffers, updatedOffers) {
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  
  const total = newOffers + updatedOffers;
  if (updatedOffers > 0) {
    message.textContent = `✅ ${total} offers processed! (${newOffers} new, ${updatedOffers} updated)`;
  } else {
    message.textContent = `✅ ${newOffers} new offers saved!`;
  }
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.remove();
  }, 5000);
}

function showErrorMessage(errorText) {
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #f44336;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  message.textContent = `❌ ${errorText}`;
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.remove();
  }, 4000);
}

function showNoOffersMessage() {
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #FF9800;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  message.textContent = '⚠️ No offers found on this page';
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.remove();
  }, 4000);
}

function initializeDealMe() {
  console.log('DealMe content script loaded');
  
  if (isAmexOffersPage()) {
    console.log('Amex offers page detected');
    
    setTimeout(() => {
      createScrapeButton();
    }, 1000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDealMe);
} else {
  initializeDealMe();
}