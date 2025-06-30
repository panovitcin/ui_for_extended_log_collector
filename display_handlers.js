import { epochToUTC } from "./utils.js"

const loginButton = document.getElementById('login_button');
const authState = document.getElementById('auth_state');


export async function updateAuthDisplayOnPopup(auth) {

    const indicator = document.createElement('span');
    indicator.classList.add('auth_indicator')

    if (!auth['status']) {
        loginButton.textContent = 'Login'
        loginButton.className = 'button is-danger is-rounded is-small is-focused'
        indicator.style.backgroundColor = 'red'
        authState.textContent = '';

        authState.appendChild(indicator);
        authState.appendChild(document.createTextNode(' Unauthorized'))
    } else {
        loginButton.textContent = 'Logout'
        loginButton.className = 'button is-info is-rounded is-small'
        indicator.style.backgroundColor = 'green'
        authState.textContent = '';

        authState.appendChild(indicator);
        authState.appendChild(document.createTextNode(' Authorized as ' + auth['user']))        
    }
    console.log('Updated Auth Display: ', auth)
}


export async function createDebugHtmlElement(debug) {
    const debugUid = debug['debug_uid'];

    // Check if "no active debugs" label exists
    const noDebugLabel = document.getElementById('no_debug');
    if (noDebugLabel) {
        noDebugLabel.remove();
    }

    // Get the template content
    const template = document.getElementById('debug-template').content.cloneNode(true);

    // Replace placeholders with actual values
    const debugState = debug['debug_state'];
    let stateColor;
    switch (debugState) {
        case 'creating...':
        case 'wait for client':
        case 'wait for client [auto]':
        case 'delayed creation':
            stateColor = 'Gold';
            break;
        case 'created':
        case 'finished':
        case 'downloaded':
            stateColor = 'YellowGreen';
            break;
        case 'in progress':
            stateColor = 'DodgerBlue';
            break;
        case 'failed to download':
        case 'failed to create':
        case 'failed to remove':
        case 'failed to check':
        case 'error on hwproxy':
        case 'removed':
            stateColor = 'Salmon';
            break;
        default:
            stateColor = 'LightSlateGray';
    }

    template.querySelector('#box_TEMPLATE_UID').id = 'box_' + debugUid;

    const uidElement = template.querySelector('#uid_TEMPLATE_UID');
    uidElement.id = 'uid_' + debugUid;

    const link = document.createElement('a');
    link.href = `http://hwproxy.${debug['debug_srv']}.someplatform.com/debugs/${debugUid}`;
    link.target = '_blank'; // Open in a new tab
    link.style.textDecoration = 'none';
    link.style.color = 'inherit';
    if (debugState === 'error on hwproxy') {
        link.style.color = 'Salmon';
    }
    link.textContent = debug['device_uid']; // Set the text content to the device UID

    uidElement.textContent = '';
    uidElement.appendChild(link);

    template.querySelector('#guid_TEMPLATE_UID').id = 'guid_' + debugUid;
    template.querySelector('#guid_' + debugUid).textContent = debug['device_type'];
    template.querySelector('#stateVal_TEMPLATE_UID').id = 'stateVal_' + debugUid;
    template.querySelector('#stateVal_' + debugUid).textContent = debugState;
    template.querySelector('#stateVal_' + debugUid).style.color = stateColor;
    template.querySelector('#serverVal_TEMPLATE_UID').id = 'serverVal_' + debugUid;
    template.querySelector('#serverVal_' + debugUid).textContent = debug['debug_srv'];
    template.querySelector('#creatorVal_TEMPLATE_UID').id = 'creatorVal_' + debugUid;
    template.querySelector('#creatorVal_' + debugUid).textContent = debug['debug_creator'];
    template.querySelector('#startVal_TEMPLATE_UID').id = 'startVal_' + debugUid;
    template.querySelector('#startVal_' + debugUid).textContent = epochToUTC(Number(debug['debug_start_at']));
    template.querySelector('#stopVal_TEMPLATE_UID').id = 'stopVal_' + debugUid;
    template.querySelector('#stopVal_' + debugUid).textContent = epochToUTC(Number(debug['debug_stop_at']));
    const finishButton = template.querySelector('#finish_button_TEMPLATE_UID')
    finishButton.id = 'finish_button_' + debugUid;
    if (debugState === 'finished') {
        finishButton.textContent = "Download"
    }
    template.querySelector('#remove_button_TEMPLATE_UID').id = 'remove_button_' + debugUid;

    

    // Append the new element to the field
    const field = document.getElementById('debugs');
    field.appendChild(template);
}


export async function removeDebugHtmlElement(debug) {
    const debugUid = debug['debug_uid']
    document.getElementById('box_' + debugUid).remove()
    console.log('removed: ', 'box_' + debugUid)    
}


export function notifyBar(message, state) {
    const isBarExists = document.querySelector('.alert-box')
    if (isBarExists) {
        isBarExists.remove()
    }
    let alertBox = document.createElement('div');
    alertBox.className = `alert-box ${state}`;
    alertBox.textContent = message;
    document.body.prepend(alertBox);

    setTimeout(() => {
    alertBox.style.transition = 'opacity 1s';
    alertBox.style.opacity = '0';
    setTimeout(() => alertBox.remove(), 1000);
    }, 3000);
}


export function confirmBar(text) {
    const bar = document.getElementById('confirm_box_template').content.cloneNode(true);
    const titleElement = bar.querySelector('.confirm-title');
    titleElement.textContent = text
    document.body.prepend(bar)
}

export function waitConfirmation() {
    let confirmButton = document.getElementById('confirm_button')
    let cancelButton = document.getElementById('cancel_button')
    return new Promise( (resolve, reject) => {
        if (!confirmButton || !cancelButton) {
            let error = "Confirmation buttons not found"
            console.error(error)
            return reject(error)
        }

        confirmButton.addEventListener('click', () => {
            resolve(true)
        })
        cancelButton.addEventListener('click', () => {
            resolve(false)
        })
    
    })
}


/*

This function was tested and working properly!

export async function createDebugHtmlElement(debug) {
    const debugUid = debug['debug_uid']
    console.log('Creating debug HTML element for debug_uid: ', debugUid)

    // check if "no active debugs" label exists
    if (document.getElementById('no_debug')) {
        document.getElementById('no_debug').remove()
    }

    const box = document.createElement('div');
    box.className = 'box';
    box.id = 'box_' + debugUid;

    const columns = document.createElement('div');
    columns.className = 'columns is-vcentered is-flex';

    const column1 = document.createElement('div');
    column1.className = 'column has-text-left is-4 is-flex-grow-1';
    column1.style.textOverflow = 'ellipsis';
    column1.style.overflow = 'hidden';

    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = debug["device_uid"];
    title.id = 'uid_' + debugUid;
    title.style = 'font-size: 0.75rem; white-space: nowrap;';

    const subtitle = document.createElement('p');
    subtitle.className = 'subtitle';
    subtitle.textContent = debug["device_type"];
    subtitle.id = 'guid_' + debugUid;
    subtitle.style = 'font-size: 0.75rem;';

    column1.appendChild(title);
    column1.appendChild(subtitle);

    const column2 = document.createElement('div');
    column2.className = 'column is-8 has-text-right is-flex-grow-2';

    const table = document.createElement('table');
    table.className = 'table is-narrow is-size-7';
    const tbody = document.createElement('tbody');
    
    const tr1 = document.createElement('tr');
    const td1 = document.createElement('td');
    const td2 = document.createElement('td');
    td1.textContent = 'state:';
    td1.style.fontWeight = 'bold'
    const debugState = debug['debug_state']; 
    td2.textContent = debugState
    let stateColor;
    switch(debugState) {
        case 'creating':
            stateColor = 'yellow';
            break
        case 'created':
            stateColor = 'green';
            break;
        case 'failed to create':
            stateColor = 'red';
            break;
        case 'failed to download':
            stateColor = 'red';
            break;
        case 'finished':
            stateColor = 'blue';
            break;
        default:
            stateColor = 'black';
    }
    td2.style.color = stateColor;
    td2.style.fontWeight = 'bold'
    td2.id = 'stateVal_' + debugUid;

    tr1.appendChild(td1);
    tr1.appendChild(td2);

    const tr2 = document.createElement('tr');
    const td3 = document.createElement('td');
    const td4 = document.createElement('td');
    td3.textContent = 'server:';
    td4.textContent = debug['debug_srv'];
    td4.id = 'serverVal_' + debugUid;
    tr2.appendChild(td3);
    tr2.appendChild(td4);

    const tr3 = document.createElement('tr');
    const td5 = document.createElement('td');
    const td6 = document.createElement('td');
    td5.textContent = 'creator:';
    td6.textContent = debug['debug_creator'];
    td6.id = 'creatorVal_' + debugUid;
    tr3.appendChild(td5);
    tr3.appendChild(td6);

    const tr4 = document.createElement('tr');
    const td7 = document.createElement('td');
    const td8 = document.createElement('td');
    td7.textContent = 'start at:';
    td8.textContent = epochToUTC(Number(debug['debug_start_at']));
    td8.id = 'startVal_' + debugUid;
    tr4.appendChild(td7);
    tr4.appendChild(td8);

    const tr5 = document.createElement('tr');
    const td9 = document.createElement('td');
    const td10 = document.createElement('td');
    td9.textContent = 'stop at:';
    td10.textContent = epochToUTC(Number(debug['debug_stop_at']));
    td10.id = 'stopVal_' + debugUid;
    tr5.appendChild(td9);
    tr5.appendChild(td10);

    tbody.appendChild(tr1);
    tbody.appendChild(tr2);
    tbody.appendChild(tr3);
    tbody.appendChild(tr4);
    tbody.appendChild(tr5);
    table.appendChild(tbody);
    column2.appendChild(table);

    const column3 = document.createElement('div');
    column3.className = 'column is-narrow has-text-right is-flex-grow-0 is-flex-shrink-1';
    const finishButton = document.createElement('button');
    finishButton.className = 'button is-danger is-rounded is-small';
    finishButton.textContent = 'Finish now';
    finishButton.id = 'finish_button_' + debugUid;
    column3.appendChild(finishButton);

    columns.appendChild(column1);
    columns.appendChild(column2);
    columns.appendChild(column3);

    box.appendChild(columns);

    const field = document.getElementById('debugs');
    field.appendChild(box);
}
*/