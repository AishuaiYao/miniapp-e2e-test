var app = getApp()

function round3(n) {
  return Math.round(n * 1000) / 1000
}

Page({
  data: {
    filterType: '',
    filterValue: '',
    title: '',
    loading: false,
    records: [],
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    recordCount: 0,
    expenseCount: 0,
    incomeCount: 0,
    recordEditVisible: false,
    recordEditId: '',
    recordEditType: 'expense',
    recordEditAmount: '',
    recordEditCategory: '',
    recordEditSubCategory: '',
    recordEditDescription: '',
    recordEditDate: '',
    recordEditTime: '',
    recordEditLocation: '',

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

    var notebookId = app.getCurrentNotebookId()
    that.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'teamRecords',
      data: { action: 'getRecords', notebookId: notebookId },
      success: function (cfRes) {
        var result = cfRes.result
        if (!result || !result.success) {
          wx.showToast({ title: result ? result.error : '加载失败', icon: 'none' })
          return
        }
        var allRecords = result.records || []
        var records = allRecords
        // 客户端按 type/value 再过滤（保持原行为）
        if (type === 'date') {
          records = allRecords.filter(function (r) { return (r.time || '').indexOf(value) === 0 })
        } else if (type === 'location') {
          records = allRecords.filter(function (r) { return r.location === value })
        }
        var icons = that.categoryIcons
        for (var i = 0; i < records.length; i++) {
          records[i].categoryIcon = icons[records[i].category] || ''
        }
        that.resolveRecordImages(records, function () {
          that.recalcStats(records)
          that.setData({ records: records, loading: false })
        })
      },
      fail: function (err) {
        console.error('[记录] 查询失败:', err)
        that.setData({ loading: false })
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
                wx.cloud.callFunction({
                  name: 'teamRecords',
                  data: {
                    action: 'updateImage',
                    recordId: recordId,
                    imageFileID: uploadRes.fileID
                  },
                  success: function (cfRes) {
                    var cfResult = cfRes.result
                    if (!cfResult || !cfResult.success) {
                      wx.showToast({ title: cfResult ? cfResult.error : '图片保存失败', icon: 'none' })
                      return
                    }
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
        wx.cloud.callFunction({
          name: 'teamRecords',
          data: { action: 'updateImage', recordId: recordId, imageFileID: '' },
          success: function (cfRes) {
            var cfResult = cfRes.result
            if (!cfResult || !cfResult.success) {
              wx.showToast({ title: cfResult ? cfResult.error : '删除失败', icon: 'none' })
              return
            }
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

  onEditRecord: function (e) {
    var id = e.currentTarget.dataset.id
    var record = this.data.records.filter(function (r) { return r._id === id })[0]
    if (!record) return
    var time = record.time || ''
    this.setData({
      recordEditVisible: true,
      recordEditId: id,
      recordEditType: record.type || 'expense',
      recordEditAmount: record.amount != null ? String(record.amount) : '',
      recordEditCategory: record.category || '',
      recordEditSubCategory: record.subCategory || '',
      recordEditDescription: record.description || '',
      recordEditDate: time.substring(0, 10),
      recordEditTime: time.substring(11, 16) || '12:00',
      recordEditLocation: record.location || ''
    })
  },

  onEditTypeChange: function (e) {
    this.setData({ recordEditType: e.currentTarget.dataset.type })
  },

  onEditAmountInput: function (e) {
    this.setData({ recordEditAmount: e.detail.value })
  },

  onEditCategoryInput: function (e) {
    this.setData({ recordEditCategory: e.detail.value })
  },

  onEditSubCategoryInput: function (e) {
    this.setData({ recordEditSubCategory: e.detail.value })
  },

  onEditDescriptionInput: function (e) {
    this.setData({ recordEditDescription: e.detail.value })
  },

  onEditDateChange: function (e) {
    this.setData({ recordEditDate: e.detail.value })
  },

  onEditTimeChange: function (e) {
    this.setData({ recordEditTime: e.detail.value })
  },

  onEditLocationInput: function (e) {
    this.setData({ recordEditLocation: e.detail.value })
  },

  closeRecordEdit: function () {
    this.setData({ recordEditVisible: false })
  },

  confirmRecordEdit: function () {
    var that = this
    var amount = Number(this.data.recordEditAmount)
    if (!amount || amount <= 0) {
      wx.showToast({ title: '请输入正确金额', icon: 'none' })
      return
    }
    var category = this.data.recordEditCategory.trim()
    if (!category) {
      wx.showToast({ title: '请输入分类', icon: 'none' })
      return
    }
    var time = this.data.recordEditDate + ' ' + this.data.recordEditTime
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time)) {
      wx.showToast({ title: '时间格式不正确', icon: 'none' })
      return
    }
    var id = this.data.recordEditId
    var update = {
      type: this.data.recordEditType,
      amount: Math.round(amount * 100) / 100,
      category: category,
      subCategory: this.data.recordEditSubCategory.trim(),
      description: this.data.recordEditDescription.trim(),
      time: time,
      location: this.data.recordEditLocation.trim()
    }

    wx.cloud.callFunction({
      name: 'teamRecords',
      data: { action: 'updateRecord', recordId: id, update: update },
      success: function (cfRes) {
        var cfResult = cfRes.result
        if (!cfResult || !cfResult.success) {
          wx.showToast({ title: cfResult ? cfResult.error : '更新失败', icon: 'none' })
          return
        }
        var records = that.data.records.map(function (record) {
          if (record._id === id) {
            record.type = update.type
            record.amount = update.amount
            record.category = update.category
            record.subCategory = update.subCategory
            record.description = update.description
            record.time = update.time
            record.location = update.location
            record.categoryIcon = that.categoryIcons[update.category] || ''
          }
          return record
        })
        that.setData({ records: records, recordEditVisible: false })
        that.recalcStats(records)
        wx.showToast({ title: '已保存', icon: 'success' })
      },
      fail: function (err) {
        console.error('[记录] 编辑保存失败:', err)
        wx.showToast({ title: '保存失败', icon: 'none' })
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
          wx.cloud.callFunction({
            name: 'teamRecords',
            data: { action: 'deleteRecord', recordId: id },
            success: function (cfRes) {
              var cfResult = cfRes.result
              if (!cfResult || !cfResult.success) {
                wx.showToast({ title: cfResult ? cfResult.error : '删除失败', icon: 'none' })
                return
              }
              if (cfResult.imageFileID) wx.cloud.deleteFile({ fileList: [cfResult.imageFileID] })
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
    var incomeCount = 0
    var expenseCount = 0
    for (var i = 0; i < records.length; i++) {
      if (records[i].type === 'income') {
        totalIncome += records[i].amount
        incomeCount++
      } else {
        totalExpense += records[i].amount
        expenseCount++
      }
    }
    this.setData({
      totalIncome: round3(totalIncome),
      totalExpense: round3(totalExpense),
      balance: round3(totalIncome - totalExpense),
      recordCount: records.length,
      expenseCount: expenseCount,
      incomeCount: incomeCount
    })
  }
})
