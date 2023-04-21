export function chunkArray(array, chunkSize) {
    const chunkArray = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunkArray.push(array.slice(i, i + chunkSize));
    }
    return chunkArray
}