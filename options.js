const saveButton = document.getElementById("save_button");


const saveOptions = () => {
    const server = document.getElementById("server_select").value;

    chrome.storage.local.set(
        { server: server }, 
        () => {
            const status = document.getElementById('status');
            status.textContent = 'Options saved.';
            setTimeout(() => {
                status.textContent = '';
            }, 750);
        } 
    )
}

const restoreOptions = () => {
    chrome.storage.local.get( { server: "prod" }, 
        (items) => {
            document.getElementById("server_select").value = items.server;
        }
    );
};


saveButton.addEventListener('click', saveOptions)
document.addEventListener('DOMContentLoaded', restoreOptions)

