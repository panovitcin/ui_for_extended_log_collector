

const Config = Object.freeze({
    'PROD_HOST': 'somehost',
    'PROD_PORT': '8001',
    'DEV_HOST': 'localhost',
    'DEV_PORT': '8001' 
});


export const config = {

    async getServerAddress() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(StorageKeys.SERVER, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                const server = result[StorageKeys.SERVER] || StorageValues.PROD;
                if (server === StorageValues.PROD) {
                    resolve({
                        host: Config.PROD_HOST,
                        port: Config.PROD_PORT
                    });
                } else {
                    resolve({
                        host: Config.DEV_HOST,
                        port: Config.DEV_PORT
                    });
                }
            })
        })
    }
};


export class Debug {
    constructor({ device_uid, device_type, device_hwuid, debug_uid, debug_srv, debug_start_at, debug_stop_at, debug_state, debug_num, debug_creator, debug_created_at, session_token, auto_wait, auto_remove }) {
        this.device_uid = device_uid
        this.device_type = device_type
        this.device_hwuid = device_hwuid
        this.debug_uid = debug_uid
        this.debug_srv = debug_srv
        this.debug_start_at = debug_start_at
        this.debug_stop_at = debug_stop_at
        this.debug_state = debug_state
        this.debug_num = debug_num
        this.debug_creator = debug_creator
        this.debug_created_at = debug_created_at
        this.session_token = session_token
        this.auto_wait = auto_wait
        this.auto_remove = auto_remove
    }
}


export class Auth {
    constructor(status, user, srv, auth_at, session_token_tig, session_token_sig, session_token_tms, session_token_usa) {
        this.status = status;
        this.user = user;
        this.srv = srv;
        this.auth_at = auth_at;
        this.session_token_tig = session_token_tig;
        this.session_token_sig = session_token_sig;
        this.session_token_tms = session_token_tms;
        this.session_token_usa = session_token_usa;
    }
}


export const StorageKeys = Object.freeze({
    DEBUGS: "debugs",
    HWLIST: "hwList",
    AUTH: "auth",
    SERVER: "server",
    POPUP_VALS: "popupValues",
    VIEW_MY: "viewMy"
});


export const StorageValues = Object.freeze({
    PROD: "prod",
    DEV: "dev"
})
