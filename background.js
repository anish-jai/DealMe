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
});