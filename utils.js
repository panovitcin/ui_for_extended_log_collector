import { Auth, Debug, StorageKeys, StorageValues, config } from "./models.js";


export async function initializeViewMy() {
    /*
        Init view all button (Show only my debugs) on start up
    */
    
    try {
        const viewMyResult = await chrome.storage.session.get(StorageKeys.VIEW_MY);
        const viewMy = viewMyResult[StorageKeys.VIEW_MY] ?? true;
        await chrome.storage.session.set({ [StorageKeys.VIEW_MY]: viewMy });
        
    } catch (error) {
        console.error("Failed to initialize view all settings: ", error);
    }
}


export async function initializeConfig() {
    try {
        // initialize server config -- define who PROD or DEV is used
        // PROD by default
        const serverConfig = await chrome.storage.local.get(StorageKeys.SERVER);
        const server = serverConfig[StorageKeys.SERVER] || StorageValues.PROD;    
        await chrome.storage.local.set({ [StorageKeys.SERVER]: server })
    } catch (error) {
        console.error("Failed to initialize config: ", error);
    }
}


export async function handleLogin() {
    console.group('service worker handle login');
    const mainSrv = 'tgi'
    const srvs = ['sgi', 'mts', 'usa']
 
    try {

        // start login on new Browser tab        
        const tab = await chrome.tabs.create({ url: `http://hwproxy.${mainSrv}.someplatform.com/authorization` });
        // wait until session token is grabbed
        const cookie_mainSrv = await grabSessionToken(mainSrv, tab)
        await chrome.tabs.remove(tab.id);
        const user = await checkAuthStatus();
        await pushToSessionStorage({ auth: new Auth(true, user, mainSrv, Date.now(), cookie_mainSrv, null, null, null) });
        
        // start background login to other servers "srvs" 
        const cookies = await loginToAllServers(srvs)
        for (const cookie of cookies) {
            await updateSessionStorage('auth', cookie)
        }

    
    } catch (error) {
        console.error('Smth went wrong handling login: ', error);
    };
    console.groupEnd();
};


async function grabSessionToken(srv, tab) {
    /*
    *   This function grabs session token on the specified server 
    *   srv: server 
    *   tab: additional filter parameter; pass "null" if no tab 
    */

    // create filter object
    const filter = { urls: [`http://hwproxy.${srv}.someplatform.com/*`] }
    if (tab) {
        filter.tabId = tab.id;
    }
    const opt_extraInfoSpec = ['responseHeaders', 'extraHeaders']

    return new Promise((resolve, reject) => {
        
        const listener = (details) => {
            console.log('Web request was received: ', details);

            if (details.responseHeaders.find(item => item.name === 'Set-Cookie')) {
                const cookie = details.responseHeaders.find(item => item.name === 'Set-Cookie').value;
                console.log(`Cookie was received for ${srv}: `, cookie);

                chrome.webRequest.onHeadersReceived.removeListener(listener);
                resolve(cookie);
            }
        };
        
        try {
            console.log(`Listen to web request on ${srv}...`);
            chrome.webRequest.onHeadersReceived.addListener(listener, filter, opt_extraInfoSpec);
        
        } catch (error) {
            console.error(`Unexpected error when grabbing Cookie for ${srv}: `, error);
            chrome.webRequest.onHeadersReceived.removeListener(listener);
            reject(error)
        };
    });
}


export async function loginToAllServers(srvs) {
    /*
        This function log in to all servers in background after the main authorization was done
    */
    const promises = srvs.map(async srv => {
        try {
            const [cookie] = await Promise.all([
                grabSessionToken(srv, null),
                fetch(`http://hwproxy.${srv}.someplatform.com/authorization`, { priority: "high" })
                    .then(response => {
                        console.log(`Fetch request to ${srv} completed.`);
                    })
                    .catch(error => {
                        console.error(`Error fetching auth for ${srv}:`, error);
                        throw error;
                    })
            ]);
            
            return { [`session_token_${srv}`]: cookie }

        } catch (error) {
            console.error(`Error receiving cookie from ${srv}:`, error)
        }
    })

    const cookies = await Promise.all(promises)
    console.log('All requests have been processed: .', cookies)
    return cookies
}


export async function handleLogout() {
    // const resp = await fetch("http://hwproxy.tgi.someplatform.com/api/logout")
    const test = await chrome.cookies.getAll({domain: 'someplatform.com' })
    for (const cookie of test) {
        await chrome.cookies.remove({name: cookie.name, url: 'https://someplatform.com/auth'})
    }
    const srvs = ['tgi', 'sgi', 'usa', 'mts']
    for (const s of srvs) {
        await chrome.cookies.remove({name: 'AIOHTTP_SESSION', url: `http://hwproxy.${s}.someplatform.com`})
    }
    const test2 = await chrome.cookies.getAll({domain: 'someplatform.com' })

    await pushToSessionStorage({ auth: new Auth(false, null, null, null, null, null, null, null) })

    // if (resp.status === 200) {
    //     console.log('Logout completed')
    // }
}


export async function checkAuthStatus() {
    /*
        Return false if unauthorized, otherwise - user name
    */
    const srvs = ['sgi', 'tgi', 'usa', 'mts']
    
    try {
        const requests = srvs.map(srv => fetch(`http://hwproxy.${srv}.someplatform.com/api/user`)
            .then(resp => { 
                
                if (resp.status === 401 || !resp.ok) {
                    throw new Error(`Status for ${srv}: ${resp.status}`);
                };

                return resp.json();
            })
        )

        const value = await Promise.any(requests);
        await updateSessionStorage(StorageKeys.AUTH, { status: true, user: value.data.name});
        return value.data.name;

    } catch (error) {
        console.log('Not authorized ', error);
        await pushToSessionStorage({ auth: new Auth(false, null, null, null, null, null, null, null) });
        return false;
    }
    
}
        

export async function getHwList() {
    /*
        Retrieve HW Device List from back-end
    */
    try {

        const address = await config.getServerAddress();
        const host = address['host'];
        const port = address['port'];
        const url = `http://${host}:${port}/get_hw_list`
        
        const resp = await fetch(url);
        if (!resp.ok) {
            console.log("HTTP error requesting back-end: ", resp);
            return;
        };
        
        const data = await resp.json();
        if (Object.keys(data['hw_list']).length === 0) {
            try {
                // force update of HW device list
                const urlUpd = `http://${host}:${port}/update_hw_list`
                await fetch(urlUpd)

            } catch (error) {
                console.error("Failed to force update of HW Device list (HW device list was empty): ", error)
            }

            while (true) {
                try {
                    const res = await fetch(url);
                    const dat = await res.json();
                    if (Object.keys(dat['hw_list']).length !== 0) {
                        break
                    }
                } catch (e) {
                    console.error("Failed to get HW Device List: ", e)                    
                }  
                await new Promise(resolve => setTimeout(resolve, 5000));  
            }
        }

        await chrome.storage.local.set({ hwList: data })
        return 1
    
    } catch(e) {
        console.error("Failed to get HW Device List: ", e)
    }

    return 0
}


export async function getDebugsList() {
    try {
        const address = await config.getServerAddress();
        const host = address['host'];
        const port = address['port'];
        
        const viewMyResult = await chrome.storage.session.get(StorageKeys.VIEW_MY);
        const viewMy = viewMyResult[StorageKeys.VIEW_MY] ?? true;
        
        const authResult = await chrome.storage.session.get(StorageKeys.AUTH);
        const auth = authResult[StorageKeys.AUTH];
        if (!auth.status) {
            console.debug("Aborted getting debugs list: not authorized");
            return;
        }

        let url;
        if (viewMy) {
            url = `http://${host}:${port}/get_debugs_list/${auth.user}`;
        } else {
            url = `http://${host}:${port}/get_debugs_list`;
        }

        const resp = await fetch(url);
        if (!resp.ok) {
            console.log("HTTP error requesting back-end: ", resp);
            return;
        };
        const data = await resp.json();
        const debugsList = data['debugs'];
        const debugs = [];

        for (const key of Object.keys(debugsList)) {
            const debugObj = debugsList[key]
            const debug = new Debug(debugObj)
            debugs.push(debug)
        }
        await chrome.storage.local.set({ debugs: debugs })
    }
    catch(e) {
        console.error("Failed to get debugs list from back-end: ", e)
    }
}


export async function pushToSessionStorage(items) {
    await chrome.storage.session.set(items)
    console.debug('Items were pushed to session.storage: ', items)
}


export async function updateSessionStorage(key, updates) {
    /*
        This function updates specified keys of the item
        
        key: main key of the stored item (object) to get this item
        updates: an object with key-value pairs to be updated { key: 'value' }  
    */
    const old_item = await chrome.storage.session.get(key)
    const updated_item = { ...old_item[key] }
    for (const k of Object.keys(updates)) {
        updated_item[k] = updates[k]
    }
    await chrome.storage.session.set( { [key]: updated_item })
}


export function validateInputTime(start, stop) {
    if (start >= stop) {
        return false;
    } 

    let delta = start - (Date.now() / 1000) 
    if (delta > (60 * 60 * 24 * 100))  // if start in 100 days
        return false;

    delta = stop - (Date.now() / 1000)
    if (delta > (60 * 60 * 24 * 100))  // if stop in 100 days
        return false;

    return true;
}


export function parseRelativeTime(input, debugCreatedAt) {
    const now = debugCreatedAt; // Current timestamp in milliseconds

    if (input === "now") {
        return Math.floor(now / 1000); // Return current UNIX timestamp
    }
    
    const match = input.match(/^\+(\d+)([mhd])$/);

    if (!match) {
        throw new Error(`Invalid input format ${input}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    let offset = 0;
    switch (unit) {
        case 'm': // minutes
            offset = value * 60 * 1000;
            break;
        case 'h': // hours
            offset = value * 60 * 60 * 1000;
            break;
        case 'd': // days
            offset = value * 24 * 60 * 60 * 1000;
            break;
        default:
            throw new Error(`Unsupported time unit: ${unit}`);
    }

    return Math.floor((now + offset) / 1000); // Convert to UNIX timestamp (seconds)
}


export async function generateDebugUid(deviceUid, hwuid, srv) {
    /*
        This function generates unique debug UID from device unique ID, hwuid, and server
    */
    const str = deviceUid + hwuid + srv;
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const resultHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
    return ['easylog_', resultHash].join("")
}


export function getUnfilledInputs() {
    /*
        Returns list of unfilled inputs
    */
    const allInputFieldIds = ['uid', 'start', 'stop', 'device_type', 'server'];
    const unfilled = allInputFieldIds.map(id => document.getElementById(id)).filter(item => !item.value).map(item => item.id)
    return unfilled
}


export function isAllInputsFilled() {
    /*
        Checks whether all necessary inputs are filled
    */
    const allInputFieldIds = ['uid', 'start', 'stop', 'device_type', 'server']
    const data = Object.fromEntries(allInputFieldIds.map(id => [id, document.getElementById(id).value]))

    if (data.uid && data.start && data.stop && data.device_type && data.server) {
        return true;
    }
    return false;
}


export function updateDisabledAttr(auth) {
    const items = Array.from(document.querySelectorAll('input, button, select')).filter(item => (item.id != 'login_button'));
    
    if (!auth['status']) {
        items.forEach(item => item.setAttribute('disabled', 'disabled'));
    } else {
        items.forEach(item => item.removeAttribute('disabled'));
    }
}


export function epochToUTC(epoch) {
    const date = new Date(epoch * 1000); // Convert to milliseconds
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}


export async function deleteDebug(debugUid) {
    /*
        This function deletes debug from HWproxy
    */
    try {
    
        const address = await config.getServerAddress();
        const host = address['host'];
        const port = address['port'];
        const url = `http://${host}:${port}/delete_debug`
        
        let payload;
        const result = await chrome.storage.local.get(StorageKeys.DEBUGS);
        const debugsList = result[StorageKeys.DEBUGS] || [];
        for (let debug of debugsList) {
            if (debug['debug_uid'] === debugUid) {
                payload = new Debug(debug)
                payload['debug_creator'] = (await chrome.storage.session.get(StorageKeys.AUTH))[StorageKeys.AUTH]['user'];
                break
            }
        }
    
        const resp = await fetch(url, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })
        return await resp.json()
        
    } catch (error) {
        console.error("Failed to delete debug: ", error)   
        return { status: 0, message: error }
    }
    
}


export async function finishDebug(debugUid) {
    try {

        const address = await config.getServerAddress();
        const host = address['host'];
        const port = address['port'];
        const url = `http://${host}:${port}/finish_debug`
        
        let payload;
        const result = await chrome.storage.local.get(StorageKeys.DEBUGS);
        const debugsList = result[StorageKeys.DEBUGS] || [];
        
        for (let debug of debugsList) {
            if (debug['debug_uid'] === debugUid) {
                payload = new Debug(debug)
                payload['debug_creator'] = (await chrome.storage.session.get(StorageKeys.AUTH))[StorageKeys.AUTH]['user'];
                break
            }
        }

        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })
        if (resp.status === 429) {
            const mes = "Too many requests. Keep calm and try later!"
            return { status: 0, message: mes }
        }
        if (!resp.ok) {
            throw new Error(resp.statusText)
        } 
        return await resp.json();
    
    } catch (e) {
        console.error('Failed to finish now debug: ', e)
        return { status: 0, message: e }
    }

}


export async function checkDebug(debugUid) {
    try {
        
        const address = await config.getServerAddress();
        const host = address['host'];
        const port = address['port'];
        const url = `http://${host}:${port}/check_debug`
        
        let payload;
        const result = await chrome.storage.local.get(StorageKeys.DEBUGS);
        const debugsList = result[StorageKeys.DEBUGS] || [];

        for (let debug of debugsList) {
            if (debug['debug_uid'] === debugUid) {
                payload = new Debug(debug)
                payload['debug_creator'] = (await chrome.storage.session.get(StorageKeys.AUTH))[StorageKeys.AUTH]['user'];
                break
            }
        }

        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })
        return await resp.json();
    
    } catch (e) {
        console.error('Failed to check the debug: ', e)
        return { status: 0, message: e }
    }
}


export async function checkAllAvailableDebugs() {
    const result = await chrome.storage.local.get(StorageKeys.DEBUGS);
    const debugs = result[StorageKeys.DEBUGS] || [];
    // const fetches = debugs.map(async (debug) => {await checkDebug(debug['debug_uid'])})
    
    const debugsTitleElem = document.querySelector('#active_debugs_title');
    if (!debugsTitleElem.querySelector('.loading-spinner')) {
        const spinner = document.createElement('span');
        spinner.className = 'loading-spinner';
        debugsTitleElem.appendChild(spinner);
    }
    for (let debug of debugs) {
        await checkDebug(debug['debug_uid']);
    }
    
    if (debugsTitleElem.querySelector('.loading-spinner')) {
        const spinner = debugsTitleElem.querySelector('.loading-spinner');
        spinner.remove();
    }
}


export const saveInputValues = async () => {
    /*
        Save values of input/select fields on popup to storage

    */
    const uid = document.getElementById('uid').value;
    const start = document.getElementById('start').value;
    const stop = document.getElementById('stop').value;
    const deviceType = document.getElementById('device_type').value;
    const server = document.getElementById('server').value;
    const autoWait = document.getElementById('auto_wait').checked;
    const autoRemove = document.getElementById('auto_remove').checked;


    await chrome.storage.session.set({
        popupValues: {
            uid,
            start,
            stop,
            deviceType,
            server,
            autoWait,
            autoRemove,
        },
    });
};


let debounceTimeout;
export const debounceSaveInputValues = () => {
    /*
        Save after 300ms of inactivity
    */

    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(saveInputValues, 300); 
};


export const cleanInputValues = async () => {
    /*
        Clean values of input/select fields on popup from storage and popup
    */
    await chrome.storage.session.remove('popupValues')
    document.getElementById('uid').value = '';
    document.getElementById('start').value = 'now';
    document.getElementById('stop').value = '+12h';
    document.getElementById('device_type').value = '';
    document.getElementById('server').value = 'tgi';
    document.getElementById('auto_wait').checked = true;
    document.getElementById('auto_remove').checked = true;
}


export function sortDebugs(debugs) {
    /*
        Sort debugs from newest to oldest
    */
    return debugs.sort((firstItem, secondItem) => secondItem.debug_created_at - firstItem.debug_created_at);
}


export function extractDeviceUidsFromInput(inputText) {
    /*
        Get multiple device uids from input field if they are. Debugs are separated by commas.
    */
    const deviceUids = inputText.split(/\s*,\s*/);
    let dupli = [];
    for (let i in deviceUids) {
        for (let j in deviceUids) {
            if (
                deviceUids[i] === deviceUids[j] &&
                i !== j &&
                !dupli.includes(deviceUids[i])
            ) {
                dupli.push(deviceUids[i])
            }
        }
    }
    
    if (dupli.length !== 0) {
        return null;
    }
    return deviceUids;
}