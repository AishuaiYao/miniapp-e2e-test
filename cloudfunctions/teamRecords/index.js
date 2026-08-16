const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

async function ensureCollections() {
  var names = ['records']
  for (var i = 0; i < names.length; i++) {
    try {
      await db.createCollection(names[i])
    } catch (e) {
      // 集合已存在，忽略
    }
  }
}

exports.main = async (event, context) => {
  await ensureCollections()
  const { OPENID } = cloud.getWXContext()
  var action = event.action

  if (action === 'getRecords') return getRecords(OPENID, event)
  if (action === 'addRecord') return addRecord(OPENID, event)
  if (action === 'updateRecord') return updateRecord(OPENID, event)
  if (action === 'deleteRecord') return deleteRecord(OPENID, event)
  if (action === 'updateImage') return updateImage(OPENID, event)

  return { success: false, error: '未知 action: ' + action }
}

async function getRecords(openId, event) {
  var nb = await getNotebookDoc(event.notebookId)
  if (!nb) return { success: false, error: '账本不存在' }
  if (!isMember(nb, openId)) return { success: false, error: '无权访问' }

  var res = await db.collection('records')
    .where({ notebookId: event.notebookId })
    .orderBy('time', 'desc')
    .limit(500)
    .get()
  return { success: true, records: res.data }
}

async function addRecord(openId, event) {
  var nb = await getNotebookDoc(event.notebookId)
  if (!nb) return { success: false, error: '账本不存在' }
  if (!isMember(nb, openId)) return { success: false, error: '无权添加' }

  var user = await getUser(openId)
  var data = event.record
  data.openId = openId
  data.creatorNickName = user.nickName
  data.creatorAvatarUrl = user.avatarUrl
  data.notebookId = event.notebookId
  data.createdAt = db.serverDate()

  var res = await db.collection('records').add({ data: data })
  data._id = res._id
  return { success: true, record: data }
}

async function updateRecord(openId, event) {
  var rec = await getRecordDoc(event.recordId)
  if (!rec) return { success: false, error: '记录不存在' }
  if (rec.openId !== openId) return { success: false, error: '只能修改自己的记录' }

  await db.collection('records').doc(event.recordId).update({ data: event.update })
  return { success: true }
}

async function deleteRecord(openId, event) {
  var rec = await getRecordDoc(event.recordId)
  if (!rec) return { success: false, error: '记录不存在' }
  if (rec.openId !== openId) return { success: false, error: '只能删除自己的记录' }

  await db.collection('records').doc(event.recordId).remove()
  return { success: true, imageFileID: rec.imageFileID || '' }
}

async function updateImage(openId, event) {
  var rec = await getRecordDoc(event.recordId)
  if (!rec) return { success: false, error: '记录不存在' }
  if (rec.openId !== openId) return { success: false, error: '只能修改自己的记录' }

  await db.collection('records').doc(event.recordId).update({
    data: { imageFileID: event.imageFileID }
  })
  return { success: true }
}

// ========== 工具函数 ==========

async function getUser(openId) {
  var res = await db.collection('users').where({ openId }).limit(1).get()
  if (res.data.length === 0) return { openId: openId, nickName: '微信用户', avatarUrl: '' }
  return res.data[0]
}

async function getNotebookDoc(notebookId) {
  try {
    var res = await db.collection('notebooks').doc(notebookId).get()
    return res.data
  } catch (e) {
    return null
  }
}

async function getRecordDoc(recordId) {
  try {
    var res = await db.collection('records').doc(recordId).get()
    return res.data
  } catch (e) {
    return null
  }
}

function isMember(notebook, openId) {
  if (!notebook.members) return false
  for (var i = 0; i < notebook.members.length; i++) {
    if (notebook.members[i].openId === openId) return true
  }
  return false
}
