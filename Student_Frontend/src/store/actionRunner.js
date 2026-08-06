export async function runRecoverableAction({ snapshot, optimistic, request, commit, rollback, onError }) {
  optimistic()
  try {
    const result = await request()
    commit(result)
    return result
  } catch (error) {
    rollback(snapshot)
    onError(error)
    throw error
  }
}
