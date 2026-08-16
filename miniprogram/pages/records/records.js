var app = getApp()

function round3(n) {
  return Math.round(n * 1000) / 1000
}

Page({
  data: {
    filterType: '',
    filterValue: '',
    title: '',
    records: [],
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    dateEditVisible: false,
    dateEditId: '',
    dateEditOldTime: '',
    dateEditValue: '',
    locationEditVisible: false,
    locationEditId: '',
    locationEditValue: '',

    imagePreviewVisible: false,
    imagePreviewId: '',
    imagePreviewUrl: ''
  },

  categoryIcons: {
    '餐饮': '/images/classification/餐饮.png',
    '交通': '/images/classification/交通.png',
    '购物': '/images/classification/购物.png',
    '服饰': '/images/classification/服饰.png',
    '娱乐': '/images/classification/游戏.png',
    '住房': '/images/classification/住房.png',
    '医疗': '/images/classification/医疗.png',
    '教育': '/images/classification/教育.png',
    '生活': '/images/classification/生活.png',
    '社交': '/images/classification/社交.png',
    '旅行': '/images/classification/旅行.png',
    '运动': '/images/classification/运动.png',
    '其他支出': '/images/classification/支出的其他.png',
    '工资': '/images/classification/工资.png',
    '奖金': '/images/classification/奖金.png',
    '兼职': '/images/classification/兼职.png',
    '投资': '/images/classification/投资.png',
    '红包': '/images/classification/红包.png',
    '退款': '/images/classification/退款.png',
    '其他收入': '/images/classification/收入的其他.png'
  },

  onLoad: function (options) {
    var data = app.tagFilterData || {}
    var type = data.filterType || ''
    var value = data.filterValue || ''
    var title = type === 'date' ? value : (value ? '定位 · ' + value : '记录')

    this.setData({
      filterType: type,
      filterValue: value,
      title: title
    })

    wx.setNavigationBarTitle({ title: title })
    this.loadRecords(type, value)

    app.tagFilterData = null
  },

  loadRecords: function (type, value) {
    var that = this
    var userInfo = app.getUserInfo()
    if (!userInfo || !userInfo.openId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    var db = wx.cloud.database()
    var query = { openId: userInfo.openId }

    if (type === 'date') {
      query.time = db.RegExp({ regexp: '^' + value })
    } else if (type === 'location') {
      query.location = value
    }

    db.collection('records').where(query).orderBy('time', 'desc').get({
      success: function (res) {
        var records = res.data || []
        var icons = that.categoryIcons
        for (var i = 0; i < records.length; i++) {
          records[i].categoryIcon = icons[records[i].category] || ''
        }
        that.resolveRecordImages(records, function () {
          that.recalcStats(records)
          that.setData({ records: records })
        })
      },
      fail: function (err) {
        console.error('[记录] 查询失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  },

  resolveRecordImages: function (records, callback) {
    var pending = 0
    for (var i = 0; i < records.length; i++) {
      if (!records[i].imageFileID) continue
      pending++
      wx.cloud.getTempFileURL({
        fileList: [records[i].imageFileID],
        success: function (res) {
          if (res.fileList && res.fileList[0]) {
            for (var j = 0; j < records.length; j++) {
              if (records[j].imageFileID === res.fileList[0].fileID) {
                records[j].imageUrl = res.fileList[0].tempFileURL
              }
            }
          }
          pending--
          if (pending === 0) callback()
        },
        fail: function () {
          pending--
          if (pending === 0) callback()
        }
      })
    }
    if (pending === 0) callback()
  },

  onAddImage: function (e) {
    var that = this
    var recordId = e.currentTarget.dataset.id
    var oldRecord = this.data.records.filter(function (record) { return record._id === recordId })[0]
    var oldImageFileID = oldRecord && oldRecord.imageFileID
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        wx.compressImage({
          src: res.tempFiles[0].tempFilePath,
          quality: 70,
          compressedWidth: 800,
          success: function (compressed) {
            var userInfo = app.getUserInfo()
            var cloudPath = 'images/' + userInfo.openId + '/' + recordId + '_' + Date.now() + '.jpg'
            wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: compressed.tempFilePath,
              success: function (uploadRes) {
                var db = wx.cloud.database()
                db.collection('records').doc(recordId).update({
                  data: { imageFileID: uploadRes.fileID },
                  success: function () {
                    wx.cloud.getTempFileURL({
                      fileList: [uploadRes.fileID],
                      success: function (urlRes) {
                        var url = urlRes.fileList[0].tempFileURL
                        var records = that.data.records.map(function (record) {
                          if (record._id === recordId) {
                            record.imageFileID = uploadRes.fileID
                            record.imageUrl = url
                          }
                          return record
                        })
                        that.setData({ records: records, imagePreviewVisible: false, imagePreviewUrl: url })
                        if (oldImageFileID && oldImageFileID !== uploadRes.fileID) {
                          wx.cloud.deleteFile({ fileList: [oldImageFileID] })
                        }
                        wx.showToast({ title: oldImageFileID ? '换图成功' : '配图成功', icon: 'success' })
                      }
                    })
                  },
                  fail: function () { wx.showToast({ title: '图片保存失败', icon: 'none' }) }
                })
              },
              fail: function () { wx.showToast({ title: '图片上传失败', icon: 'none' }) }
            })
          }
        })
      }
    })
  },

  onImageBtnTap: function (e) {
    var has = e.currentTarget.dataset.has
    var id = e.currentTarget.dataset.id
    var url = e.currentTarget.dataset.url
    if (!has) {
      this.onAddImage({ currentTarget: { dataset: { id: id } } })
      return
    }
    this.setData({ imagePreviewVisible: true, imagePreviewId: id, imagePreviewUrl: url })
  },

  closeImagePreview: function () {
    this.setData({ imagePreviewVisible: false })
  },

  onDeleteImage: function (e) {
    var that = this
    var recordId = e.currentTarget.dataset.id
    var oldRecord = this.data.records.filter(function (record) { return record._id === recordId })[0]
    var fileID = oldRecord && oldRecord.imageFileID
    if (!fileID) return

    wx.showModal({
      title: '提示',
      content: '确定删除这张配图？',
      success: function (res) {
        if (!res.confirm) return
        var db = wx.cloud.database()
        db.collection('records').doc(recordId).update({
          data: { imageFileID: '' },
          success: function () {
            wx.cloud.deleteFile({ fileList: [fileID] })
            var records = that.data.records.map(function (record) {
              if (record._id === recordId) {
                record.imageFileID = ''
                record.imageUrl = ''
              }
              return record
            })
            that.setData({ records: records, imagePreviewVisible: false })
            wx.showToast({ title: '已删除', icon: 'success' })
          },
          fail: function () { wx.showToast({ title: '删除失败', icon: 'none' }) }
        })
      }
    })
  },

  onPreviewImage: function (e) {
    wx.previewImage({ current: e.currentTarget.dataset.url, urls: [e.currentTarget.dataset.url] })
  },

  onModalStop: function () {},

  onEditDate: function (e) {
    var oldTime = e.currentTarget.dataset.time
    this.setData({
      dateEditVisible: true,
      dateEditId: e.currentTarget.dataset.id,
      dateEditOldTime: oldTime,
      dateEditValue: oldTime.substring(0, 10)
    })
  },

  onDateChange: function (e) {
    this.setData({ dateEditValue: e.detail.value })
  },

  closeDateEdit: function () {
    this.setData({ dateEditVisible: false })
  },

  confirmDateEdit: function () {
    var that = this
    var oldTime = this.data.dateEditOldTime
    var newTime = this.data.dateEditValue + ' ' + oldTime.substring(11, 16)
    var db = wx.cloud.database()

    db.collection('records').doc(this.data.dateEditId).update({
      data: { time: newTime },
      success: function () {
        var records = that.data.records.map(function (record) {
          if (record._id === that.data.dateEditId) record.time = newTime
          return record
        })
        that.setData({ records: records, dateEditVisible: false })
        that.recalcStats(records)
        wx.showToast({ title: '日期已更新', icon: 'success' })
      },
      fail: function (err) {
        console.error('[记录] 日期更新失败:', err)
        wx.showToast({ title: '更新失败', icon: 'none' })
      }
    })
  },

  onEditLocation: function (e) {
    this.setData({
      locationEditVisible: true,
      locationEditId: e.currentTarget.dataset.id,
      locationEditValue: e.currentTarget.dataset.location
    })
  },

  onLocationInput: function (e) {
    this.setData({ locationEditValue: e.detail.value })
  },

  closeLocationEdit: function () {
    this.setData({ locationEditVisible: false })
  },

  confirmLocationEdit: function () {
    var that = this
    var location = this.data.locationEditValue.trim()
    var id = this.data.locationEditId
    var db = wx.cloud.database()

    db.collection('records').doc(id).update({
      data: { location: location },
      success: function () {
        var records = that.data.records.map(function (record) {
          if (record._id === id) record.location = location
          return record
        })
        that.setData({ records: records, locationEditVisible: false })
        that.recalcStats(records)
        wx.showToast({ title: '地点已更新', icon: 'success' })
      },
      fail: function (err) {
        console.error('[记录] 地点更新失败:', err)
        wx.showToast({ title: '更新失败', icon: 'none' })
      }
    })
  },

  onDeleteRecord: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '提示',
      content: '确定删除这条记录？',
      success: function (res) {
        if (res.confirm) {
          var db = wx.cloud.database()
          db.collection('records').doc(id).remove({
            success: function () {
              var deleted = that.data.records.filter(function (r) { return r._id === id })[0]
              if (deleted && deleted.imageFileID) wx.cloud.deleteFile({ fileList: [deleted.imageFileID] })
              var records = that.data.records.filter(function (r) { return r._id !== id })
              that.recalcStats(records)
              that.setData({ records: records })
              wx.showToast({ title: '已删除', icon: 'none' })
            },
            fail: function (err) {
              console.error('[记录] 删除失败:', err)
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  recalcStats: function (records) {
    var totalIncome = 0
    var totalExpense = 0
    for (var i = 0; i < records.length; i++) {
      if (records[i].type === 'income') {
        totalIncome += records[i].amount
      } else {
        totalExpense += records[i].amount
      }
    }
    this.setData({
      totalIncome: round3(totalIncome),
      totalExpense: round3(totalExpense),
      balance: round3(totalIncome - totalExpense)
    })
  }
})
