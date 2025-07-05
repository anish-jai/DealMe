function isAmexOffersPage() {
  const url = window.location.href;
  return url.includes('global.americanexpress.com/offers/eligible');
}

function isGrouponPage() {
  const url = window.location.href;
  return url.includes('groupon.com');
}

function isBofAPage() {
  const url = window.location.href;
  return url.includes('secure.bankofamerica.com/customer-deals');
}

function isRakutenPage() {
  const url = window.location.href;
  return url.includes('rakuten.com');
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
  
  button.addEventListener('click', () => {
    if (isAmexOffersPage()) {
      scrapeAmexOffers();
    } else if (isGrouponPage()) {
      scrapeGrouponOffers();
    } else if (isBofAPage()) {
      scrapeBofAOffers();
    } else if (isRakutenPage()) {
      scrapeRakutenOffers();
    }
  });
  
  document.body.appendChild(button);
}

async function scrapeAmexOffers() {
  console.log('Starting Amex offers scraping...');
  
  const offerElements = document.querySelectorAll('[data-locator-id="merchantOffer"]');
  
  // PASS 1: Expand all collapsed offers at once
  console.log('Pass 1: Expanding all collapsed offers...');
  const collapsedButtons = [];
  offerElements.forEach(element => {
    const expandButton = element.querySelector('button[aria-expanded="false"]');
    if (expandButton) {
      collapsedButtons.push(expandButton);
      expandButton.click();
    }
  });
  
  console.log(`Found ${collapsedButtons.length} collapsed offers, expanding...`);
  
  // Wait for all expansions to complete
  if (collapsedButtons.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // PASS 2: Extract all data including merchant links
  console.log('Pass 2: Extracting offer data...');
  const offers = [];
  
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
        merchantLink: extractMerchantLink(element),
        scrapedAt: new Date().toISOString(),
        url: window.location.href
      };
      
      console.log(`Amex offer ${index}:`, offer);
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

function extractMerchantLink(element) {
  const allLinks = element.querySelectorAll('a[href]');
  
  const validLinks = [];
  const excludedLinks = [];
  
  for (const link of allLinks) {
    const href = link.href;
    
    // Check if it's a merchant link (not Amex platform link)
    const isAmexLink = href.includes('americanexpress.com') || 
                      href.includes('amex.com') ||
                      href.includes('/benefits/') ||
                      href.includes('/en-us/');
    
    if (href.startsWith('http') && !isAmexLink) {
      validLinks.push(href);
    } else {
      excludedLinks.push(href);
    }
  }
  
  // Return the first valid merchant link found
  if (validLinks.length > 0) {
    return validLinks[0];
  }
  
  // If no link found but we have a merchant name that looks like a domain, construct URL
  const merchantName = extractMerchantName(element);
  if (merchantName && (merchantName.includes('.com') || merchantName.includes('.net') || merchantName.includes('.org'))) {
    const cleanDomain = merchantName.replace(/\s*-.*$/, '').trim(); // Remove everything after dash
    if (cleanDomain.match(/^[a-zA-Z0-9.-]+\.(com|net|org|co|io)$/)) {
      const constructedUrl = cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`;
      return constructedUrl;
    }
  }
  
  return null;
}

function scrapeBofAOffers() {
  console.log('Starting BofA offers scraping...');
  
  const offers = [];
  const offerElements = document.querySelectorAll('.load-available-deal.available-deal');
  
  offerElements.forEach((element, index) => {
    try {
      const offer = {
        id: `bofa-${Date.now()}-${index}`,
        source: 'Bank of America',
        merchant: extractBofAMerchantName(element),
        discount: extractBofADiscountText(element),
        description: extractBofADescription(element),
        expiryDate: extractBofAExpiryDate(element),
        category: extractBofACategory(element),
        merchantLink: extractBofAMerchantLink(element),
        scrapedAt: new Date().toISOString(),
        url: window.location.href
      };
      
      console.log(`BofA offer ${index}:`, offer);
      if (offer.merchant && offer.discount) {
        offers.push(offer);
      }
    } catch (error) {
      console.error('Error parsing BofA offer element:', error);
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

function extractBofAMerchantName(element) {
  // First try to get from the deal-logo img alt attribute
  const logoImg = element.querySelector('.deal-logo img[alt]');
  if (logoImg && logoImg.alt) {
    return logoImg.alt.replace(/\s*logo\s*/gi, '').trim();
  }
  
  // Try to get from the company name in expanded view
  const companyNameEl = element.querySelector('.company_name');
  if (companyNameEl && companyNameEl.textContent.trim()) {
    return companyNameEl.textContent.trim();
  }
  
  // Try to get from the deal link name attribute
  const dealLink = element.querySelector('a[data-deal-id]');
  if (dealLink && dealLink.getAttribute('name')) {
    const nameAttr = dealLink.getAttribute('name');
    const match = nameAttr.match(/Add this (.+?) Deal/i);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Try to get from aria-label
  const logoWrapper = element.querySelector('.deal-logo');
  if (logoWrapper && logoWrapper.getAttribute('aria-label')) {
    const ariaLabel = logoWrapper.getAttribute('aria-label');
    // Extract merchant name from aria-label like "Earn $15 cash back with Turo when..."
    const match = ariaLabel.match(/with ([A-Za-z]+)/i);
    if (match) {
      return match[1].trim();
    }
  }
  
  return 'Unknown Merchant';
}

function extractBofADiscountText(element) {
  // Try to get the discount amount from the deal-offer-percent span
  const discountEl = element.querySelector('.deal-offer-percent');
  if (discountEl && discountEl.textContent.trim()) {
    const discountText = discountEl.textContent.trim();
    
    // If it's a dollar amount like "$15", format it properly
    if (discountText.startsWith('$')) {
      return `${discountText} cash back`;
    }
    
    // If it's a percentage, format it
    if (discountText.includes('%')) {
      return `${discountText} cash back`;
    }
    
    // For other cases like "Use Link"
    if (discountText === 'Use Link') {
      // Try to get more details from the expansion heading
      const headingEl = element.querySelector('.expansion_heading');
      if (headingEl) {
        const heading = headingEl.textContent.trim();
        // Extract discount from heading like "Earn $15 cash back with Turo..."
        const dollarMatch = heading.match(/\$\d+/i);
        if (dollarMatch) {
          return `${dollarMatch[0]} cash back`;
        }
        const percentMatch = heading.match(/(\d+)%/i);
        if (percentMatch) {
          return `${percentMatch[1]}% cash back`;
        }
      }
      return 'Special offer - use link';
    }
    
    return discountText;
  }
  
  return 'Cash back available';
}

function extractBofADescription(element) {
  const merchantName = extractBofAMerchantName(element);
  const discount = extractBofADiscountText(element);
  return `Earn ${discount} on ${merchantName} purchases`;
}

function extractBofAExpiryDate(element) {
  // Try to get from the deal-exp-date element
  const expDateEl = element.querySelector('.deal-exp-date');
  if (expDateEl && expDateEl.textContent.trim()) {
    const expText = expDateEl.textContent.trim();
    // Extract date from "Exp. 08/06/25"
    const dateMatch = expText.match(/(\d{2}\/\d{2}\/\d{2,4})/i);
    if (dateMatch) {
      return dateMatch[1];
    }
  }
  
  // Fallback: search in all text content
  const textContent = element.textContent;
  const dateMatch = textContent.match(/exp\.?\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  if (dateMatch) {
    return dateMatch[1];
  }
  
  return null;
}

function extractBofACategory(element) {
  return 'General';
}

function extractBofAMerchantLink(element) {
  // Try to get the actual merchant link from the expansion content
  const merchantLinkEl = element.querySelector('.custom-btn[href], a.custom-btn');
  if (merchantLinkEl && merchantLinkEl.href) {
    return merchantLinkEl.href;
  }
  
  // Try to get from any external links in the deal details
  const externalLinks = element.querySelectorAll('a[href^="http"]:not([href*="bankofamerica.com"]):not([href*="bac-assets.com"])');
  if (externalLinks.length > 0) {
    return externalLinks[0].href;
  }
  
  // Fallback: construct URL from merchant name
  const merchantName = extractBofAMerchantName(element);
  if (merchantName && merchantName !== 'Unknown Merchant') {
    const cleanName = merchantName.toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');
    
    return `https://${cleanName}.com`;
  }
  
  return null;
}

function scrapeGrouponOffers() {
  console.log('Starting Groupon offers scraping...');
  
  const offers = [];
  const offerElements = document.querySelectorAll('[data-testid^="deal-card-"]');
  
  offerElements.forEach((element, index) => {
    try {
      const offer = {
        id: `groupon-${Date.now()}-${index}`,
        source: 'Groupon',
        merchant: extractGrouponMerchantName(element),
        discount: extractGrouponDiscountText(element),
        description: extractGrouponDescription(element),
        expiryDate: null, // Groupon doesn't show expiry dates on listing pages
        category: extractGrouponCategory(element),
        merchantLink: extractGrouponMerchantLink(element),
        scrapedAt: new Date().toISOString(),
        url: extractGrouponUrl(element)
      };
      
      console.log(`Groupon offer ${index}:`, offer);
      if (offer.merchant && offer.discount) {
        offers.push(offer);
      }
    } catch (error) {
      console.error('Error parsing Groupon offer element:', error);
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

function extractGrouponMerchantName(element) {
  const merchantEl = element.querySelector('.text-body');
  if (merchantEl && merchantEl.textContent.trim()) {
    return merchantEl.textContent.trim();
  }
  
  const titleEl = element.querySelector('h2[title]');
  if (titleEl && titleEl.title) {
    // Extract merchant name from title if needed
    const title = titleEl.title;
    const colonIndex = title.indexOf(':');
    if (colonIndex > -1) {
      return title.substring(colonIndex + 1).trim();
    }
    return title.trim();
  }
  
  return 'Unknown Merchant';
}

function extractGrouponDiscountText(element) {
  const discountEl = element.querySelector('[data-testid="discount"]');
  if (discountEl && discountEl.textContent.trim()) {
    return discountEl.textContent.trim();
  }
  
  const priceContainer = element.querySelector('.notranslate');
  if (priceContainer) {
    const strikePrice = priceContainer.querySelector('[data-testid="strike-through-price"]');
    const greenPrice = priceContainer.querySelector('[data-testid="green-price"]');
    
    if (strikePrice && greenPrice) {
      const originalPrice = strikePrice.textContent.replace('$', '');
      const salePrice = greenPrice.textContent.replace('$', '');
      const discount = Math.round((1 - parseFloat(salePrice) / parseFloat(originalPrice)) * 100);
      return `${discount}% off - Was $${originalPrice}, Now $${salePrice}`;
    }
  }
  
  return 'Discount available';
}

function extractGrouponDescription(element) {
  const titleEl = element.querySelector('h2[title]');
  if (titleEl && titleEl.title) {
    return titleEl.title;
  }
  
  const locationEl = element.querySelector('.text-body');
  if (locationEl) {
    const locationText = locationEl.textContent.trim();
    if (locationText && !locationText.includes('mi')) {
      return locationText;
    }
  }
  
  return element.textContent.slice(0, 100) + '...';
}

function extractGrouponCategory(element) {
  // Try to determine category from title or merchant name
  const titleEl = element.querySelector('h2[title]');
  if (titleEl && titleEl.title) {
    const title = titleEl.title.toLowerCase();
    
    if (title.includes('restaurant') || title.includes('dining') || title.includes('food')) {
      return 'Food & Dining';
    } else if (title.includes('spa') || title.includes('massage') || title.includes('beauty')) {
      return 'Beauty & Spa';
    } else if (title.includes('activity') || title.includes('adventure') || title.includes('tour')) {
      return 'Activities';
    } else if (title.includes('hotel') || title.includes('travel') || title.includes('vacation')) {
      return 'Travel';
    }
  }
  
  return 'General';
}

function extractGrouponUrl(element) {
  const linkEl = element.querySelector('a[href]');
  if (linkEl && linkEl.href) {
    return linkEl.href;
  }
  
  return window.location.href;
}

function extractGrouponMerchantLink(element) {
  // Check if the element itself is an anchor tag with href
  if (element.tagName === 'A' && element.href) {
    console.log('Found Groupon deal link from element itself:', element.href);
    return element.href;
  }
  
  // Look for the main deal link within the element
  const linkEl = element.querySelector('a[href*="groupon.com/deals/"]');
  if (linkEl && linkEl.href) {
    console.log('Found Groupon deal link:', linkEl.href);
    return linkEl.href;
  }
  
  // Fallback: look for any external links that might be merchant websites
  const externalLink = element.querySelector('a[href]:not([href*="groupon.com"])');
  if (externalLink && externalLink.href && externalLink.href.startsWith('http')) {
    console.log('Found external merchant link:', externalLink.href);
    return externalLink.href;
  }
  
  console.log('No merchant link found for Groupon element');
  return null;
}

function scrapeRakutenOffers() {
  console.log('Starting Rakuten offers scraping...');
  
  const offers = [];
  const offerElements = document.querySelectorAll('a.chakra-link[aria-label*="Rakuten coupons and Cash Back"]');
  
  offerElements.forEach((element, index) => {
    try {
      const offer = {
        id: `rakuten-${Date.now()}-${index}`,
        source: 'Rakuten',
        merchant: extractRakutenMerchantName(element),
        discount: extractRakutenDiscountText(element),
        description: extractRakutenDescription(element),
        expiryDate: null, // Rakuten doesn't show expiry dates in carousel
        category: extractRakutenCategory(element),
        merchantLink: extractRakutenMerchantLink(element),
        scrapedAt: new Date().toISOString(),
        url: window.location.href
      };
      
      console.log(`Rakuten offer ${index}:`, offer);
      if (offer.merchant && offer.discount) {
        offers.push(offer);
      }
    } catch (error) {
      console.error('Error parsing Rakuten offer element:', error);
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

function extractRakutenMerchantName(element) {
  // Try to get from the img alt attribute
  const logoImg = element.querySelector('img[alt]');
  if (logoImg && logoImg.alt) {
    // Extract merchant name from alt like "Warriors Shop - Rakuten coupons and Cash Back"
    const altText = logoImg.alt;
    const match = altText.match(/^(.+?)\s*-\s*Rakuten/i);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Try to get from aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    // Extract from "Find out more at Warriors Shop - Rakuten coupons and Cash Back"
    const match = ariaLabel.match(/Find out more at (.+?)\s*-\s*Rakuten/i);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Try to get from href URL
  const href = element.href;
  if (href) {
    // Extract from URL like "https://www.rakuten.com/warriorsshop_15977-xfas"
    const urlMatch = href.match(/rakuten\.com\/([^_]+)_/i);
    if (urlMatch) {
      // Convert URL slug to readable name
      const urlSlug = urlMatch[1];
      return urlSlug.replace(/([a-z])([A-Z])/g, '$1 $2')
                   .replace(/\b\w/g, l => l.toUpperCase());
    }
  }
  
  return 'Unknown Merchant';
}

function extractRakutenDiscountText(element) {
  // Try to get the main cash back percentage
  const discountEl = element.querySelector('.css-1o3lf2p');
  if (discountEl && discountEl.textContent.trim()) {
    const discountText = discountEl.textContent.trim();
    
    // Check if there's a "was" price for comparison
    const wasEl = element.querySelector('.css-1a1exxh');
    if (wasEl && wasEl.textContent.trim()) {
      const wasText = wasEl.textContent.trim();
      return `${discountText} (${wasText})`;
    }
    
    return discountText;
  }
  
  return 'Cash back available';
}

function extractRakutenDescription(element) {
  const merchantName = extractRakutenMerchantName(element);
  const discount = extractRakutenDiscountText(element);
  return `Earn ${discount} on ${merchantName} purchases through Rakuten`;
}

function extractRakutenCategory(element) {
  const merchantName = extractRakutenMerchantName(element).toLowerCase();
  
  // Categorize based on merchant name
  if (merchantName.includes('nike') || merchantName.includes('adidas') || merchantName.includes('gap') || 
      merchantName.includes('old navy') || merchantName.includes('sephora') || merchantName.includes('ulta')) {
    return 'Fashion & Beauty';
  } else if (merchantName.includes('target') || merchantName.includes('walmart') || merchantName.includes('bed bath')) {
    return 'Retail';
  } else if (merchantName.includes('samsung') || merchantName.includes('lenovo') || merchantName.includes('ebay')) {
    return 'Electronics';
  } else if (merchantName.includes('groupon')) {
    return 'Deals & Coupons';
  }
  
  return 'General';
}

function extractRakutenMerchantLink(element) {
  // The href on the element is the Rakuten tracking link
  if (element.href) {
    return element.href;
  }
  
  return null;
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
  } else if (isGrouponPage()) {
    console.log('Groupon page detected');
    
    setTimeout(() => {
      createScrapeButton();
    }, 1000);
  } else if (isBofAPage()) {
    console.log('BofA deals page detected');
    
    setTimeout(() => {
      createScrapeButton();
    }, 1000);
  } else if (isRakutenPage()) {
    console.log('Rakuten page detected');
    
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