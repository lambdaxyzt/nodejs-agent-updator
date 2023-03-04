import pm2 from "./pm2-promise.js"


const ListOfProcess = async () => {
    await pm2.connect()
    const list = await pm2.list()
    await pm2.disconnect()
    return list
}

const isProcessStarted = async (name) => {
    for(const process of await ListOfProcess()) {
        if(process.name === name) {
            return true
        }
    }
    return false
}


export {
    isProcessStarted,
    ListOfProcess
}