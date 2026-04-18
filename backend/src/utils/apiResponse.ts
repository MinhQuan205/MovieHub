export const apiResponse = {
    success<T>(data: T, message = 'OK') {
        return { success: true, data, message}
    },
    error(code: string, message: string) {
        return { success: false, error: { code, message}}
    },
}