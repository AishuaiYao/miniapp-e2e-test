var app = getApp()

Page({
  data: {
    filterType: '',
    filterValue: '',
    title: '',
    records: [],
    totalIncome: 0,
    totalExpense: 0
  },

  onLoad: function (options) {
    var data = app.tagFilterData || {}
    var type = data.filterType || ''
    var value = data.filterValue || ''
    var title = type === 'date' ? value : (value ? '📍 ' + value : '记录')

    this.setData({
      filterType: type,
      filterValue: value,
      title: title
    })

    wx.setNavigationBarTitle({ title: title })
    this.loadRecords(type, value)

    // 用完清除
    app.tagFilterData = null
  },

  loadRecords: function (type, value) {
    var that = this
    var notebookId = app.getCurrentNotebookId()

    wx.getStorage({
      key: 'account_records',
      success: function (res) {
        var allRecords = res.data || []
        var records = notebookId ? allRecords.filter(function (r) {
          return r.notebookId === notebookId
        }) : allRecords

        if (type === 'date') {
          records = records.filter(function (r) {
            return (r.time || '').substring(0, 10) === value
          })
        } else if (type === 'location') {
          records = records.filter(function (r) {
            return r.location === value
          })
        }

        var totalIncome = 0
        var totalExpense = 0
        for (var i = 0; i < records.length; i++) {
          if (records[i].type === 'income') {
            totalIncome += records[i].amount
          } else {
            totalExpense += records[i].amount
          }
        }

        that.setData({
          records: records,
          totalIncome: totalIncome,
          totalExpense: totalExpense
        })
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
          var records = that.data.records.filter(function (r) { return r.id !== id })
          that.setData({ records: records })
          that.saveAllRecords(records)
          that.recalcStats(records)
        }
      }
    })
  },

  saveAllRecords: function (currentFiltered) {
    var that = this
    var notebookId = this.data.filterType ? app.getCurrentNotebookId() : ''
    wx.getStorage({
      key: 'account_records',
      success: function (res) {
        var allRecords = res.data || []
        var otherRecords = notebookId ? allRecords.filter(function (r) {
          return r.notebookId !== notebookId
        }) : []
        var currentAll = notebookId ? allRecords.filter(function (r) {
          return r.notebookId === notebookId
        }) : allRecords

        var deletedIds = {}
        var filteredIds = {}
        for (var i = 0; i < that.data.records.length; i++) {
          filteredIds[that.data.records[i].id] = true
        }
        for (var j = 0; j < currentFiltered.length; j++) {
          filteredIds[currentFiltered[j].id] = true
        }

        var kept = currentAll.filter(function (r) {
          return filteredIds[r.id]
        })

        var merged = otherRecords.concat(kept)
        wx.setStorage({ key: 'account_records', data: merged })
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
    this.setData({ totalIncome: totalIncome, totalExpense: totalExpense })
  }
})
