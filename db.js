class DealMeDB {
  constructor() {
    this.storageKey = 'dealme_database';
    this.metaKey = 'dealme_meta';
    this.init();
  }

  async init() {
    try {
      console.log('DealMeDB initializing...');
      const meta = await this.getMeta();
      console.log('Existing meta:', meta);
      if (!meta) {
        console.log('No meta found, creating initial schema...');
        await this.createInitialSchema();
      } else {
        console.log('Meta found, database already initialized');
      }
    } catch (error) {
      console.error('DealMeDB initialization error:', error);
    }
  }

  async createInitialSchema() {
    const initialData = {
      offers: [],
      merchants: [],
      categories: [],
      settings: {
        autoDedup: true,
        maxOffers: 1000,
        retentionDays: 90,
        autoDeleteExpired: true,
        expiredGraceDays: 1
      },
      lastCleanup: new Date().toISOString(),
      version: '1.0.0'
    };

    const meta = {
      version: '1.0.0',
      created: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      offerCount: 0,
      merchantCount: 0
    };

    await this.setData(initialData);
    await this.setMeta(meta);
  }

  async getData() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome storage error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log('Raw storage result:', result);
          console.log('Storage key:', this.storageKey);
          console.log('Data found:', result[this.storageKey]);
          resolve(result[this.storageKey] || {});
        }
      });
    });
  }

  async setData(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({[this.storageKey]: data}, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async getMeta() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.metaKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[this.metaKey] || null);
        }
      });
    });
  }

  async setMeta(meta) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({[this.metaKey]: meta}, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async updateMeta(updates) {
    const meta = await this.getMeta();
    const updatedMeta = { ...meta, ...updates, lastAccessed: new Date().toISOString() };
    await this.setMeta(updatedMeta);
  }

  generateOfferHash(offer) {
    const hashString = `${offer.merchant}-${offer.discount}-${offer.source}`;
    return btoa(hashString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  parseExpirationDate(expiryDateString) {
    if (!expiryDateString) return null;
    
    // Common Amex date formats: "MM/DD/YYYY", "MM/DD/YY", "Month DD, YYYY"
    const datePatterns = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,  // MM/DD/YY
      /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/  // Month DD, YYYY
    ];
    
    let parsedDate = null;
    
    // Try standard date parsing first
    try {
      parsedDate = new Date(expiryDateString);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 2020) {
        return parsedDate;
      }
    } catch (e) {}
    
    // Try pattern matching
    for (const pattern of datePatterns) {
      const match = expiryDateString.match(pattern);
      if (match) {
        if (pattern.source.includes('w+')) {
          // Month name format
          const monthName = match[1];
          const day = parseInt(match[2]);
          const year = parseInt(match[3]);
          parsedDate = new Date(`${monthName} ${day}, ${year}`);
        } else {
          // Numeric format
          const month = parseInt(match[1]) - 1; // JS months are 0-indexed
          const day = parseInt(match[2]);
          let year = parseInt(match[3]);
          
          // Handle 2-digit years
          if (year < 50) year += 2000;
          else if (year < 100) year += 1900;
          
          parsedDate = new Date(year, month, day);
        }
        
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }
    
    console.warn('Could not parse expiration date:', expiryDateString);
    return null;
  }

  isOfferExpired(offer, settings = null) {
    // Use parsed date if available, otherwise parse from string
    let expiryDate;
    if (offer.parsedExpiryDate) {
      expiryDate = new Date(offer.parsedExpiryDate);
    } else if (offer.expiryDate) {
      expiryDate = this.parseExpirationDate(offer.expiryDate);
    } else {
      return false;
    }
    
    if (!expiryDate || isNaN(expiryDate.getTime())) return false;
    
    const now = new Date();
    const gracePeriod = settings?.expiredGraceDays || 1;
    const deleteAfter = new Date(expiryDate);
    deleteAfter.setDate(deleteAfter.getDate() + gracePeriod);
    
    return now > deleteAfter;
  }

  async addOffer(offer) {
    try {
      const data = await this.getData();
      const offerHash = this.generateOfferHash(offer);
      
      const existingOffer = data.offers.find(o => o.hash === offerHash);
      if (existingOffer && data.settings.autoDedup) {
        existingOffer.lastSeen = new Date().toISOString();
        existingOffer.seenCount = (existingOffer.seenCount || 1) + 1;
        await this.setData(data);
        return { success: true, type: 'updated', offer: existingOffer };
      }

      const parsedExpiryDate = this.parseExpirationDate(offer.expiryDate);
      
      const newOffer = {
        ...offer,
        hash: offerHash,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        seenCount: 1,
        isActive: true,
        parsedExpiryDate: parsedExpiryDate ? parsedExpiryDate.toISOString() : null
      };

      data.offers.push(newOffer);
      
      const merchant = offer.merchant;
      if (merchant && !data.merchants.includes(merchant)) {
        data.merchants.push(merchant);
      }

      const category = offer.category;
      if (category && !data.categories.includes(category)) {
        data.categories.push(category);
      }

      if (data.offers.length > data.settings.maxOffers) {
        data.offers = data.offers
          .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
          .slice(0, data.settings.maxOffers);
      }

      await this.setData(data);
      await this.updateMeta({ 
        offerCount: data.offers.length, 
        merchantCount: data.merchants.length 
      });

      // Run cleanup if it's been more than 24 hours since last cleanup
      await this.autoCleanupIfNeeded();

      return { success: true, type: 'created', offer: newOffer };
    } catch (error) {
      console.error('Error adding offer:', error);
      return { success: false, error: error.message };
    }
  }

  async addOffers(offers) {
    const results = [];
    for (const offer of offers) {
      const result = await this.addOffer(offer);
      results.push(result);
    }
    return results;
  }

  async getAllOffers(options = {}) {
    try {
      const data = await this.getData();
      console.log('getAllOffers - raw data:', data);
      let offers = data.offers || [];
      console.log('getAllOffers - offers array:', offers);

      if (options.merchant) {
        offers = offers.filter(o => o.merchant === options.merchant);
      }

      if (options.category) {
        offers = offers.filter(o => o.category === options.category);
      }

      if (options.isActive !== undefined) {
        offers = offers.filter(o => o.isActive === options.isActive);
      }

      if (options.sortBy) {
        offers = offers.sort((a, b) => {
          const aVal = a[options.sortBy];
          const bVal = b[options.sortBy];
          return options.sortOrder === 'asc' ? 
            (aVal > bVal ? 1 : -1) : 
            (aVal < bVal ? 1 : -1);
        });
      }

      if (options.limit) {
        offers = offers.slice(0, options.limit);
      }

      console.log('getAllOffers - final offers:', offers);
      return offers;
    } catch (error) {
      console.error('Error getting offers:', error);
      return [];
    }
  }

  async getOfferById(id) {
    try {
      const data = await this.getData();
      return data.offers.find(o => o.id === id) || null;
    } catch (error) {
      console.error('Error getting offer by ID:', error);
      return null;
    }
  }

  async updateOffer(id, updates) {
    try {
      const data = await this.getData();
      const offerIndex = data.offers.findIndex(o => o.id === id);
      
      if (offerIndex === -1) {
        return { success: false, error: 'Offer not found' };
      }

      data.offers[offerIndex] = { 
        ...data.offers[offerIndex], 
        ...updates, 
        updatedAt: new Date().toISOString() 
      };

      await this.setData(data);
      return { success: true, offer: data.offers[offerIndex] };
    } catch (error) {
      console.error('Error updating offer:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteOffer(id) {
    try {
      const data = await this.getData();
      const offerIndex = data.offers.findIndex(o => o.id === id);
      
      if (offerIndex === -1) {
        return { success: false, error: 'Offer not found' };
      }

      const deletedOffer = data.offers.splice(offerIndex, 1)[0];
      await this.setData(data);
      await this.updateMeta({ offerCount: data.offers.length });

      return { success: true, offer: deletedOffer };
    } catch (error) {
      console.error('Error deleting offer:', error);
      return { success: false, error: error.message };
    }
  }

  async clearAllOffers() {
    try {
      console.log('clearAllOffers: Starting clear operation');
      const data = await this.getData();
      console.log('clearAllOffers: Got data:', data);
      data.offers = [];
      data.merchants = [];
      data.categories = [];
      console.log('clearAllOffers: Cleared arrays, saving data...');
      await this.setData(data);
      console.log('clearAllOffers: Data saved, updating meta...');
      await this.updateMeta({ offerCount: 0, merchantCount: 0 });
      console.log('clearAllOffers: Meta updated, operation complete');
      return { success: true };
    } catch (error) {
      console.error('Error clearing offers:', error);
      return { success: false, error: error.message };
    }
  }

  async getStats() {
    try {
      const data = await this.getData();
      const meta = await this.getMeta();
      
      const activeOffers = data.offers.filter(o => o.isActive).length;
      const totalOffers = data.offers.length;
      const merchants = data.merchants.length;
      const categories = data.categories.length;

      const recentOffers = data.offers.filter(o => {
        const daysSinceLastSeen = (Date.now() - new Date(o.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceLastSeen <= 7;
      }).length;

      const expiredOffers = data.offers.filter(o => this.isOfferExpired(o, data.settings)).length;
      
      const offersExpiringNextWeek = data.offers.filter(o => {
        if (!o.parsedExpiryDate) return false;
        const expiryDate = new Date(o.parsedExpiryDate);
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return expiryDate >= now && expiryDate <= nextWeek;
      }).length;

      return {
        totalOffers,
        activeOffers,
        expiredOffers,
        merchants,
        categories,
        recentOffers,
        offersExpiringNextWeek,
        dbVersion: meta.version,
        lastCleanup: data.lastCleanup,
        retentionDays: data.settings.retentionDays,
        autoDeleteExpired: data.settings.autoDeleteExpired
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return null;
    }
  }

  async autoCleanupIfNeeded() {
    try {
      const data = await this.getData();
      const lastCleanup = new Date(data.lastCleanup);
      const now = new Date();
      const hoursSinceCleanup = (now - lastCleanup) / (1000 * 60 * 60);
      
      // Run cleanup if it's been more than 24 hours
      if (hoursSinceCleanup >= 24) {
        console.log('Running automatic cleanup...');
        const result = await this.cleanup();
        if (result.success && result.cleanedCount > 0) {
          console.log(`Auto-cleanup completed: ${result.expiredCount} expired, ${result.retentionCount} old offers removed`);
        }
        return result;
      }
      
      return { success: true, skipped: true, reason: 'Recent cleanup found' };
    } catch (error) {
      console.error('Error in auto cleanup:', error);
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    try {
      const data = await this.getData();
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - data.settings.retentionDays);

      const beforeCount = data.offers.length;
      let expiredCount = 0;
      let retentionCount = 0;

      data.offers = data.offers.filter(offer => {
        // Check if offer is expired (beyond grace period)
        if (data.settings.autoDeleteExpired && this.isOfferExpired(offer, data.settings)) {
          expiredCount++;
          return false;
        }
        
        // Check retention period (based on lastSeen)
        if (new Date(offer.lastSeen) <= retentionDate) {
          retentionCount++;
          return false;
        }
        
        return true;
      });

      // Rebuild merchants and categories lists
      const activeMerchants = [...new Set(data.offers.map(o => o.merchant))];
      const activeCategories = [...new Set(data.offers.map(o => o.category))];
      
      data.merchants = activeMerchants;
      data.categories = activeCategories;
      data.lastCleanup = new Date().toISOString();
      
      await this.setData(data);
      
      const totalCleaned = expiredCount + retentionCount;
      await this.updateMeta({ 
        offerCount: data.offers.length,
        merchantCount: data.merchants.length 
      });

      return { 
        success: true, 
        cleanedCount: totalCleaned,
        expiredCount,
        retentionCount,
        remainingOffers: data.offers.length
      };
    } catch (error) {
      console.error('Error during cleanup:', error);
      return { success: false, error: error.message };
    }
  }

  async exportData() {
    try {
      const data = await this.getData();
      const meta = await this.getMeta();
      
      return {
        exportDate: new Date().toISOString(),
        version: meta.version,
        data: data
      };
    } catch (error) {
      console.error('Error exporting data:', error);
      return null;
    }
  }

  async importData(importData) {
    try {
      if (!importData.data || !importData.version) {
        throw new Error('Invalid import data format');
      }

      await this.setData(importData.data);
      await this.updateMeta({ 
        offerCount: importData.data.offers.length,
        merchantCount: importData.data.merchants.length
      });

      return { success: true, importedOffers: importData.data.offers.length };
    } catch (error) {
      console.error('Error importing data:', error);
      return { success: false, error: error.message };
    }
  }
}

const dealMeDB = new DealMeDB();