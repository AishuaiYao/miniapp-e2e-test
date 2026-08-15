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
    balance: 0
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
        that.recalcStats(records)
        that.setData({ records: records })
      },
      fail: function (err) {
        console.error('[记录] 查询失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
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
