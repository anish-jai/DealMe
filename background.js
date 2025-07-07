chrome.runtime.onInstalled.addListener(function() {
  console.log('DealMe extension installed');
  
  chrome.storage.sync.set({
    dealmeSettings: {
      version: '1.0.0',
      enabled: true,
      installDate: new Date().toISOString()
    }
  });
});

chrome.action.onClicked.addListener(function(tab) {
  console.log('Extension icon clicked');
  
  // Preload database when extension is accessed
  try {
    chrome.storage.local.get(['dealme_database'], (result) => {
      console.log('Database preloaded on extension access');
    });
  } catch (error) {
    console.log('Database preload failed:', error);
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getData') {
    chrome.storage.sync.get(['dealmeData'], function(result) {
      sendResponse({data: result.dealmeData || []});
    });
    return true;
  }
  
  if (request.action === 'saveData') {
    chrome.storage.sync.set({dealmeData: request.data}, function() {
      sendResponse({status: 'saved'});
    });
    return true;
  }
  
  if (request.action === 'openExtension') {
    // Chrome doesn't allow programmatic popup opening from content scripts
    // Show badge notification to guide user to click extension icon
    chrome.action.setBadgeText({text: '!'});
    chrome.action.setBadgeBackgroundColor({color: '#4CAF50'});
    
    // Clear badge after a few seconds
    setTimeout(() => {
      chrome.action.setBadgeText({text: ''});
    }, 5000);
    
    // Set title to provide instruction
    chrome.action.setTitle({title: 'DealMe - Click to view your deals!'});
    
    // Reset title after some time
    setTimeout(() => {
      chrome.action.setTitle({title: 'DealMe'});
    }, 10000);
    
    sendResponse({success: false, message: 'Please click the DealMe extension icon'});
    return true;
  }
});