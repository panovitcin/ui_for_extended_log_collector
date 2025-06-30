import { handleLogin, handleLogout, checkAuthStatus, getHwList, pushToSessionStorage, getDebugsList, initializeConfig, updateSessionStorage, loginToAllServers, initializeViewMy } from './utils.js';
import { Debug, Auth, StorageKeys } from './models.js';


console.log('Service worker started');

const authDataInitial = { [StorageKeys.AUTH]: new Auth(false, null, null, null, null, null, null, null) }

// onInstalled event
chrome.runtime.onInstalled.addListener(async details => {

    // initialize server config
    await initializeConfig();
    
    await Promise.all([
        pushToSessionStorage(authDataInitial),  // put initial auth values to session storage 
        getHwList()
    ]);

    // init view all setting
    await initializeViewMy();
});


// onStartup event
chrome.runtime.onStartup.addListener(async details => {

    // initialize server config
    await initializeConfig();

    await Promise.all([
        pushToSessionStorage(authDataInitial),  // put initial auth values to session storage 
        getHwList()
    ]);

    // init view all setting
    await initializeViewMy();
});


// listen to messages from front-end
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log('service worker received message:', request);

    if (request.message === 'login') {
        console.log('service worker received login message');
        await handleLogin();
    } else if (request.message === 'logout') {
        console.log('service worker received logout message');
        await handleLogout();
    } else if (request.message === 'check_auth_state') {
        console.log('service worker received check_auth_state message');
        const res = await checkAuthStatus();
        
        if (res) {
            //  update tokens from all other servers in the background;
            const srvs = ['sgi', 'mts', 'usa', 'tgi']; 
            const cookies = await loginToAllServers(srvs);
            for (const cookie of cookies) {
                await updateSessionStorage(StorageKeys.AUTH, cookie);
            };
        };
    }
});


chrome.runtime.onConnect.addListener( port => {
    /*
        Listen to popup open event to start getting debugs from back-end
    */
    getDebugsList();
    let fetchInterval = setInterval(getDebugsList, 5000);

    port.onDisconnect.addListener(() => {
        clearInterval(fetchInterval)
    });
})

