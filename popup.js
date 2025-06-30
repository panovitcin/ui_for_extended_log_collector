import { Debug, StorageKeys, config } from "./models.js"
import { updateAuthDisplayOnPopup, createDebugHtmlElement, removeDebugHtmlElement, notifyBar, confirmBar, waitConfirmation } from "./display_handlers.js"
import { 
    parseRelativeTime, isAllInputsFilled, getUnfilledInputs, generateDebugUid, 
    updateDisabledAttr, deleteDebug, finishDebug, checkAllAvailableDebugs, getHwList, 
    cleanInputValues, debounceSaveInputValues, extractDeviceUidsFromInput, sortDebugs,
    validateInputTime, getDebugsList
} from "./utils.js"


console.info("popup.js loaded");

// connect to listener in service worker to catch popup loading event 
const port = chrome.runtime.connect();

const loginButton = document.getElementById('login_button');
const debugButton = document.getElementById('debug_button');
const viewMyCheckbox = document.getElementById('view_my');


document.addEventListener('DOMContentLoaded', async () => {
    /*
        When popup is loaded, need to perform steps below:
    */

    // 1. update Auth display on popup
    const updateAuthDisplay = async () => {
        const { [StorageKeys.AUTH]: auth } = await chrome.storage.session.get(StorageKeys.AUTH)
        await updateAuthDisplayOnPopup(auth);
    }

    // 2. check current Auth status
    const checkAuthStatus = async () => {
        await chrome.runtime.sendMessage({ message: "check_auth_state" })
    } 

    // 3. update Debugs display on popup 
    const updateDebugsDisplay = async () => {
        const result = await chrome.storage.local.get(StorageKeys.DEBUGS)
        const debugs = result[StorageKeys.DEBUGS] || [];
        const sortedDebugs = sortDebugs(debugs)
        for (let debug of sortedDebugs) {
            await createDebugHtmlElement(debug)
        }

        // make disabled if not authorized
        const { [StorageKeys.AUTH]: auth } = await chrome.storage.session.get(StorageKeys.AUTH)
        updateDisabledAttr(auth);
    }

    // 4. update Device List display on popup
    const updateDeviceListDisplay = async () => {
        const deviceType = document.getElementById('device_type_list')
        const { [StorageKeys.HWLIST]: hwList } = await chrome.storage.local.get(StorageKeys.HWLIST)
        
        if (!hwList || !hwList.hw_list) {
            console.log("No HW list is stored in local storage")
            await getHwList()
            return
        }  
        
        for (let o in hwList['hw_list']) {
            let el = deviceType.appendChild(document.createElement('option'))
            el.value = o
        }
    }

    // 5. Get values of input/select fields on popup from storage
    const restoreInputValues = async () => {
        const { popupValues } = await chrome.storage.session.get(StorageKeys.POPUP_VALS);
        if (popupValues) {
            document.getElementById('uid').value = popupValues.uid || '';
            document.getElementById('start').value = popupValues.start || 'now';
            document.getElementById('stop').value = popupValues.stop || '+12h';
            document.getElementById('device_type').value = popupValues.deviceType || '';
            document.getElementById('server').value = popupValues.server || 'tgi';
            document.getElementById('auto_wait').checked = popupValues.autoWait || true;
            document.getElementById('auto_remove').checked = popupValues.autoRemove || true;
        }

        // update view my
        const viewMyResult = await chrome.storage.session.get(StorageKeys.VIEW_MY);
        const viewMy = viewMyResult[StorageKeys.VIEW_MY] ?? true;
        document.getElementById('view_my').checked = viewMy;
    };


    // execute all funs sumualtaneously
    await Promise.all([updateAuthDisplay(), updateDebugsDisplay(), updateDeviceListDisplay(), checkAuthStatus(), restoreInputValues()])
    await checkAllAvailableDebugs()
})
  

loginButton.addEventListener('click', async () => {
    /*
        This listener sends messages to service worker to handle Login/Logout
    */
    if (loginButton.textContent === 'Login') {
        await chrome.runtime.sendMessage({message: 'login'});
    } else if (loginButton.textContent === 'Logout') {
        await chrome.runtime.sendMessage({message: 'logout'})
    }
});


// handle click on Debug button
debugButton.addEventListener('click', async () => {

    try {

        const address = await config.getServerAddress();
        const host = address['host'];
        const port = address['port'];
        const url = `http://${host}:${port}/create_debug`

        debugButton.classList.add('is-loading')

        if (isAllInputsFilled()) {

            // handle creation of multiple debugs at one request
            const inputText = document.getElementById('uid').value
            const deviceUids = extractDeviceUidsFromInput(inputText);
            if (!deviceUids) {
                notifyBar("Remove duplicated unique ID", 'info');
                debugButton.classList.remove('is-loading');
                return null;
            }

            const deviceType = document.getElementById('device_type').value;
            const deviceHwuid = (await chrome.storage.local.get(StorageKeys.HWLIST))[StorageKeys.HWLIST]['hw_list'][deviceType].replace(/-/g, "");
            const debugCreatedAt = Date.now();
            const debugSrv = document.getElementById('server').value;
            const debugStartAt = (parseRelativeTime(document.getElementById('start').value, debugCreatedAt)).toString();
            const debugStopAt = (parseRelativeTime(document.getElementById('stop').value, debugCreatedAt)).toString();
            const debugState = 'creating...';
            const debugNum = 'n/a';
            const debugCreator = (await chrome.storage.session.get(StorageKeys.AUTH))[StorageKeys.AUTH]['user'];

            const cookieResult = await chrome.cookies.get({ url: `http://hwproxy.${debugSrv}.someplatform.com`, name: 'AIOHTTP_SESSION' });
            if (!cookieResult) {
                notifyBar("Try to re-login. Authorization problem.", 'info');
                // debugButton.classList.remove('is-loading');
                return null;
            }
            const sessionToken = cookieResult['value'];

            const auto_wait = document.getElementById('auto_wait').checked;
            const auto_remove = document.getElementById('auto_remove').checked;

            const res = validateInputTime(debugStartAt, debugStopAt)
            if (!res) {
                notifyBar("Invalid start or stop time", 'info');
                // debugButton.classList.remove('is-loading');
                return null;
            }

            for (let uid of deviceUids) {
                try {

                    const debugUid = await generateDebugUid(uid, deviceHwuid, debugSrv);

                // prepare debug object
                const debug = new Debug({
                    device_uid: uid,
                    device_type: deviceType,
                    device_hwuid: deviceHwuid,
                    debug_uid: debugUid,
                    debug_srv: debugSrv,
                    debug_start_at: debugStartAt,
                    debug_stop_at: debugStopAt,
                    debug_state: debugState,
                    debug_num: debugNum,
                    debug_creator: debugCreator,
                    debug_created_at: debugCreatedAt,
                    session_token: sessionToken,
                    auto_wait: auto_wait,
                    auto_remove: auto_remove,
                });
                
            
                try {
                    const resp = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(debug)
                    })
                    const resp_data = await resp.json()
                    
                    if (!resp_data['status']) {
                        if (resp_data['reason'] === 'duplicate') {
                            notifyBar(`Failed to create: ${debug.debug_uid} already exists`, 'warning')
                        }
                    }
                    else {
                        notifyBar("Create debug request successfully accepted", 'success')
                        
                        const result = await chrome.storage.local.get(StorageKeys.DEBUGS);
                        const debugs = result[StorageKeys.DEBUGS] || [];
                        if (debugs.length === 0) {
                            await chrome.storage.local.set({ debugs: [debug] });
                        } else {
                            const debugsUpd = debugs;
                            debugsUpd.push(debug);
                            await chrome.storage.local.set({ debugs: debugsUpd });
                        }

                            await cleanInputValues()
                        }
                    } catch (e) {
                        console.error("Failed to create new debug: ", e)
                        throw new Error(e)
                    }

                } catch(e) {
                    console.error("Error creating debug: ", e)
                    notifyBar("Failed to create new debug", 'warning')
                }
            }

        } else {
            const unfilledInputs = getUnfilledInputs()
            notifyBar(`Fill in ${unfilledInputs.join(', ')} to create debug`, 'info')
        }

        // debugButton.classList.remove('is-loading')

    } catch (e) {
        notifyBar(`${e}`, 'info')

    } finally {
        debugButton.classList.remove('is-loading');
        // try to get immediately changes from back-end
        setTimeout(getDebugsList, 1000);
    }
});


viewMyCheckbox.addEventListener('change', async () => {
    try {
        let val;
        if (viewMyCheckbox.checked) {
            val = true;
        } else {
            val = false;
        }
        await chrome.storage.session.set({ [StorageKeys.VIEW_MY]: val });
        getDebugsList();

    } catch (error) {
        console.error("Failed to handle 'Show only my debugs' button click: ", error);
    }
})


// listen to changes in chrome storage
chrome.storage.onChanged.addListener(async changes => {
    console.debug('onChanged event in storage: ', changes)
    const changesKeys = Object.keys(changes);
    
    // if Auth was changed
    if (changesKeys.includes(StorageKeys.AUTH)) {
        const auth = changes[StorageKeys.AUTH]['newValue']
        await updateAuthDisplayOnPopup(auth);
        await updateDisabledAttr(auth);
    } 

    // if Debugs were changed
    if (changesKeys.includes(StorageKeys.DEBUGS)) {
        const existingKeys = Object.keys(changes[StorageKeys.DEBUGS])

        // creating new debugs list
        if (existingKeys.includes('newValue')) {
            const sortedDebugs = sortDebugs(changes[StorageKeys.DEBUGS]['newValue'])
            for (let debug of sortedDebugs) {
                await createDebugHtmlElement(debug);
            }
        };

        // removing old debugs list
        if (existingKeys.includes('oldValue')) {
            for (let debug of changes[StorageKeys.DEBUGS]['oldValue']) {
                await removeDebugHtmlElement(debug);
            }
        };
    }
})


// handle click on Remove button for every debug on pop-up
const debugsContainer = document.getElementById('debugs');
debugsContainer.addEventListener('click', async (event) => {
    try {
        if (event.target && event.target.id.startsWith('remove_button_')) {
            event.target.classList.add('is-loading')
            confirmBar('Do you confirm the deletion?')
            
            const confirm = await waitConfirmation();
            if (confirm) {
                const targetId = event.target.id.replace('remove_button_', '')
                const result = await deleteDebug(targetId);

                if (result['status']) {
                    notifyBar(`Request to delete ${targetId} successfully accepted`, 'success')
                } else {
                    notifyBar(`Failed to delete debug: ${result['message']}`, 'warning')
                    event.target.classList.remove('is-loading')     
                }
            } else {
                event.target.classList.remove('is-loading');
            }
            const bar = document.querySelector('.confirm-box')
            if (bar) {
                bar.remove();
            }
        }
    } catch (e) {
        console.error("Failed to delete debug: ", e);
        if (event && event.target) {
            event.target.classList.remove('is-loading');
        }
        
    } finally {
        // try to get the latest debugs after 1000ms
        setTimeout(getDebugsList, 1000);
    }
});


debugsContainer.addEventListener('click', async (event) => {
    try {
        if (event.target && event.target.id.startsWith('finish_button_')) {
            event.target.classList.add('is-loading');
            const targetDebugUid = event.target.id.replace('finish_button_', '');
            const targetDebugState = document.getElementById('stateVal_' + targetDebugUid).textContent;
            
            let action = 'finish'
            if (targetDebugState === 'finished') {
                action = 'download'
            } 

            confirmBar(`Do you really want to ${action} debug now?`)
            confirm = await waitConfirmation();

            if (confirm) {
                
                const result = await finishDebug(targetDebugUid);
        
                if (result['status']) {
                    notifyBar(`Request to ${action} ${targetDebugUid} now successfully accepted`, 'success')
                } else {
                    notifyBar(`Failed to ${action} debug: ${result['message']}`, 'warning')
                }
            }
            const bar = document.querySelector('.confirm-box')
            if (bar) {
                bar.remove()
            }
            event.target.classList.remove('is-loading');
        }
        
    } catch (error) {
        console.error("Failed to handle finish now button: ", error);
        if (event && event.target) {
            event.target.classList.remove('is-loading');
        }
    } finally {
        // try to get the latest debugs 
        setTimeout(getDebugsList, 1000);
    }
    
});


// Handle tags in popup.html
document.getElementById('start_tags').addEventListener('click', async (event) => {
    const tag = event.target.textContent;
    const start = document.getElementById('start');
    start.value = tag;
});


document.getElementById('stop_tags').addEventListener('click', async (event) => {
    const tag = event.target.textContent;
    const stop = document.getElementById('stop');
    stop.value = tag;
});


// This block of code handles persistence of input values on popup
document.getElementById('uid').addEventListener('input', debounceSaveInputValues);
document.getElementById('start').addEventListener('input', debounceSaveInputValues);
document.getElementById('stop').addEventListener('input', debounceSaveInputValues);
document.getElementById('device_type').addEventListener('input', debounceSaveInputValues);
document.getElementById('server').addEventListener('change', debounceSaveInputValues);
document.getElementById('auto_wait').addEventListener('change', debounceSaveInputValues);
