var app = getApp()

Page({
  data: {
    // 导航栏
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64,
    drawerVisible: false,

    // 录音状态
    recording: false,
    loading: false,
    recordDuration: 0,
    recordStatusText: '正在录音...',
    loadingText: '正在识别语音...',

    // ASR 结果
    asrText: '',

    // 记账数据
    records: [],
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,

    // 饼状图数据
    pieData: [],

    // 分类统计
    categoryStats: [],
    activeTab: 'all', // all / expense / income
    filteredRecords: [],

    // 当前账本
    currentNotebookId: '',
    currentNotebookName: '',
    hasNotebook: false,

    // 文本输入弹窗
    textInputVisible: false,
    textInputValue: ''
  },

  // 录音管理器
  recorderManager: null,
  durationTimer: null,
  recordStartTime: 0,
  // 权限缓存
  recordAuthed: null,
  // 本地录音路径（本次）
  localAudioPath: '',
  audioContext: null,
  playingIndex: -1,

  onLoad: function () {
    // 初始化导航栏尺寸
    this.setData(app.getNavBarLayout())

    this.recorderManager = wx.getRecorderManager()
    var that = this

    this.recorderManager.onStart(function () {
      console.log('[录音] 开始录音')
    })

    this.recorderManager.onStop(function (res) {
      console.log('[录音] 结束, duration:', res.duration, 'ms, path:', res.tempFilePath)
      that.handleRecordEnd(res)
    })

    this.recorderManager.onError(function (err) {
      console.error('[录音] 错误:', err)
      if (that.durationTimer) {
        clearInterval(that.durationTimer)
        that.durationTimer = null
      }
      that.recorderManager.stop()
      that.setData({ recording: false, loading: false })
      wx.showToast({ title: '录音失败', icon: 'none' })
    })

    // 加载本地存储的记账记录
    this.loadRecords()

    // 预检查录音权限
    this.checkRecordAuth()
  },

  onShow: function () {
    // 每次显示页面时刷新当前账本
    var notebookId = app.getCurrentNotebookId()
    var notebookName = app.getCurrentNotebookName()
    this.setData({
      currentNotebookId: notebookId,
      currentNotebookName: notebookName,
      hasNotebook: !!notebookId
    })

    // 重新加载记录（可能从其他页面切换回来）
    if (notebookId) {
      this.loadRecords()
    }
  },

  checkRecordAuth: function () {
    var that = this
    wx.getSetting({
      success: function (res) {
        that.recordAuthed = !!res.authSetting['scope.record']
        console.log('[录音] 权限预检查:', that.recordAuthed)
      }
    })
  },

  // ========== 录音 ==========

  onRecordStart: function () {
    if (this.data.loading || this.data.recording) return

    // 检查是否已有账本
    if (!this.data.currentNotebookId) {
      wx.showModal({
        title: '请先创建账本',
        content: '记账前需要先创建一个账本，是否现在创建？',
        confirmText: '去创建',
        confirmColor: '#38bdf8',
        success: function (res) {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/notebooks/notebooks' })
          }
        }
      })
      return
    }

    // 已授权，直接开始录音（零延迟）
    if (this.recordAuthed === true) {
      this.startRecording()
      return
    }

    // 权限未知或未授权，走异步检查
    var that = this
    wx.getSetting({
      success: function (res) {
        if (res.authSetting['scope.record']) {
          that.recordAuthed = true
          that.startRecording()
        } else {
          wx.authorize({
            scope: 'scope.record',
            success: function () {
              that.recordAuthed = true
              that.startRecording()
            },
            fail: function () {
              wx.showModal({
                title: '提示',
                content: '需要录音权限才能使用语音功能',
                confirmText: '去设置',
                success: function (res) {
                  if (res.confirm) wx.openSetting()
                }
              })
            }
          })
        }
      }
    })
  },

  startRecording: function () {
  this.setData({
    recording: true,
    recordDuration: 10,
    recordStatusText: '正在录音...'
  })
  this.recordStartTime = Date.now()

  var that = this
  this.durationTimer = setInterval(function () {
    var elapsed = Math.floor((Date.now() - that.recordStartTime) / 1000)
    var remaining = 10 - elapsed
    if (remaining <= 0) {
      that.setData({ recordDuration: 0 })
      that.recorderManager.stop()
      return
    }
    that.setData({ recordDuration: remaining })
  }, 1000)

    this.recorderManager.start({
      duration: 10000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    })
  },

  onRecordEnd: function () {
    if (!this.data.recording) return

    // 误触保护：录音时长过短，兜底 stop 释放资源后静默忽略
    var duration = Date.now() - this.recordStartTime
    if (duration < 300) {
      if (this.durationTimer) {
        clearInterval(this.durationTimer)
        this.durationTimer = null
      }
      this.recorderManager.stop()
      this.setData({ recording: false })
      return
    }

    this.recorderManager.stop()
  },

  handleRecordEnd: function (res) {
    if (this.durationTimer) {
      clearInterval(this.durationTimer)
      this.durationTimer = null
    }

    var duration = Date.now() - this.recordStartTime
    if (duration < 500) {
      this.setData({ recording: false })
      wx.showToast({ title: '录音太短，请长按说话', icon: 'none' })
      return
    }

    this.localAudioPath = res.tempFilePath
    this.setData({
      recording: false,
      loading: true,
      loadingText: '正在识别语音...',
      asrText: ''
    })

    var that = this
    var fileManager = wx.getFileSystemManager()
    fileManager.readFile({
      filePath: res.tempFilePath,
      encoding: 'base64',
      success: function (fileRes) {
        that.callASR(fileRes.data)
      },
      fail: function (err) {
        console.error('[ASR] 读取文件失败:', err)
        that.setData({ loading: false })
        wx.showToast({ title: '读取录音失败', icon: 'none' })
      }
    })
  },

  // ========== ASR ==========

  callASR: function (audioBase64) {
    var apiKey = app.getAliyunApiKey()
    if (!apiKey) {
      this.setData({ loading: false })
      wx.showToast({ title: 'API Key 未就绪', icon: 'none' })
      return
    }

    var audioData = 'data:audio/mpeg;base64,' + audioBase64
    var that = this

    wx.request({
      url: 'https://llm-mhwgg01ku321wyjx.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'X-DashScope-SSE': 'disable'
      },
      data: {
        model: 'qwen-audio-3.0-asr-flash',
        input: {
          messages: [{
            role: 'user',
            content: [{ type: 'input_audio', input_audio: { data: audioData } }]
          }]
        },
        parameters: { format: 'mp3', sample_rate: '16000' }
      },
      success: function (res) {
        console.log('[ASR] 响应:', res.data)
        if (res.statusCode === 200 && res.data && res.data.text) {
          var text = res.data.text
          that.setData({
            asrText: text,
            loadingText: 'AI 正在分析...'
          })
          that.callHY3(text)
        } else {
          that.setData({ loading: false })
          wx.showToast({ title: '识别失败', icon: 'none' })
        }
      },
      fail: function (err) {
        console.error('[ASR] 失败:', err)
        that.setData({ loading: false })
        wx.showToast({ title: '网络请求失败', icon: 'none' })
      }
    })
  },

  // ========== HY3 记账分析 ==========

  callHY3: function (text) {
    var that = this
    var answer = ''
    var startTime = Date.now()

    try {
      var model = wx.cloud.extend.AI.createModel('cloudbase')

      var systemPrompt = '你是一个智能记账助手。用户会用语音描述收支信息，你需要分析并提取结构化数据。\n\n' +
        '请严格按照以下JSON格式回复，不要有任何额外文字：\n' +
        '{\n' +
        '  "is_transaction": true/false,\n' +
        '  "type": "expense/income",\n' +
        '  "amount": 0,\n' +
        '  "category": "大类",\n' +
        '  "sub_category": "细类",\n' +
        '  "description": "简短描述",\n' +
        '  "location": "地点，提取不到则为空字符串",\n' +
        '  "reply": "给用户的简短回复"\n' +
        '}\n\n' +
        '【支出大类及细类】\n' +
        '餐饮：堂食、外卖、快餐、零食、饮料、咖啡、聚餐、夜宵、早餐、午餐、晚餐\n' +
        '交通：打车、出租车、地铁、公交、共享单车、高铁、火车、飞机、停车费、加油、过路费、充电\n' +
        '购物：日用品、文具、电子设备、数码配件、家居用品、厨房用具\n' +
        '服饰：衣服、裤子、鞋子、包、帽子、配饰、首饰\n' +
        '娱乐：电影、游戏、KTV、密室、演唱会、演出、游乐场、视频会员、音乐会员\n' +
        '住房：房租、房贷、水电费、燃气费、物业费、宽带、装修、维修\n' +
        '医疗：门诊、药品、住院、体检、牙科、眼科、保健\n' +
        '教育：学费、培训、书籍、课程、考试报名\n' +
        '生活：理发、美容、洗浴、快递、洗衣、家政、宠物、话费\n' +
        '社交：红包、礼物、请客、份子钱\n' +
        '旅行：酒店、机票、门票、纪念品、跟团\n' +
        '运动：健身、瑜伽、游泳、球类、装备\n' +
        '其他支出：无法归类的支出\n\n' +
        '【收入大类及细类】\n' +
        '工资：基本工资、绩效、加班费\n' +
        '奖金：年终奖、项目奖、全勤奖\n' +
        '兼职：副业、自由职业、外包\n' +
        '投资：股票、基金、理财、利息、分红\n' +
        '红包：微信红包、转账、礼金\n' +
        '退款：退货退款、报销\n' +
        '其他收入：无法归类的收入\n\n' +
        '【示例】\n' +
        '用户："今天中午吃饭花了30块" → {"is_transaction":true,"type":"expense","amount":30,"category":"餐饮","sub_category":"午餐","description":"吃饭","reply":"已记：餐饮-午餐 30元"}\n' +
        '用户："打车去公司花了15" → {"is_transaction":true,"type":"expense","amount":15,"category":"交通","sub_category":"打车","description":"打车去公司","reply":"已记：交通-打车 15元"}\n' +
        '用户："扫了个共享单车1块5" → {"is_transaction":true,"type":"expense","amount":1.5,"category":"交通","sub_category":"共享单车","description":"共享单车","reply":"已记：交通-共享单车 1.5元"}\n' +
        '用户："点了个外卖28块" → {"is_transaction":true,"type":"expense","amount":28,"category":"餐饮","sub_category":"外卖","description":"外卖","reply":"已记：餐饮-外卖 28元"}\n' +
        '用户："买了件衣服199" → {"is_transaction":true,"type":"expense","amount":199,"category":"服饰","sub_category":"衣服","description":"买衣服","reply":"已记：服饰-衣服 199元"}\n' +
        '用户："充了个月度视频会员25" → {"is_transaction":true,"type":"expense","amount":25,"category":"娱乐","sub_category":"视频会员","description":"视频会员","reply":"已记：娱乐-视频会员 25元"}\n' +
        '用户："工资到账8000" → {"is_transaction":true,"type":"income","amount":8000,"category":"工资","sub_category":"基本工资","description":"工资","reply":"已记：工资-基本工资 8000元"}\n' +
        '用户："股票赚了2000" → {"is_transaction":true,"type":"income","amount":2000,"category":"投资","sub_category":"股票","description":"股票收益","reply":"已记：投资-股票 2000元"}\n' +
        '用户："你好" → {"is_transaction":false,"type":"","amount":0,"category":"","sub_category":"","description":"","reply":"你好，请告诉我你的收支情况"}\n\n' +
        '注意：amount必须是数字类型，不要加引号或单位。'

      var requestData = {
        model: 'hy3-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ]
      }

      var timeoutFlag = true
      var timeoutTimer = setTimeout(function () {
        if (timeoutFlag) {
          that.setData({ loading: false })
          wx.showToast({ title: 'AI 响应超时', icon: 'none' })
        }
      }, 20000)

      ;(async function () {
        try {
          var res = await model.streamText({ data: requestData })
          timeoutFlag = false
          clearTimeout(timeoutTimer)

          for await (var chunk of res.textStream) {
            answer += chunk
          }

          console.log('[HY3] 完成, 回答:', answer)
          that.handleAIReply(answer)
        } catch (err) {
          timeoutFlag = false
          clearTimeout(timeoutTimer)
          console.error('[HY3] 错误:', err)
          that.setData({ loading: false })
          wx.showToast({ title: 'AI 分析失败', icon: 'none' })
        }
      })()
    } catch (e) {
      console.error('[HY3] 异常:', e)
      this.setData({ loading: false })
    }
  },

  // ========== 解析 AI 回复，记账 ==========

  handleAIReply: function (answer) {
    this.setData({ loading: false })

    // 尝试从回答中提取 JSON
    var jsonStr = ''
    try {
      // 找到第一个 { 和最后一个 }
      var start = answer.indexOf('{')
      var end = answer.lastIndexOf('}')
      if (start >= 0 && end > start) {
        jsonStr = answer.substring(start, end + 1)
        var result = JSON.parse(jsonStr)
        console.log('[记账] 解析结果:', result)

        if (result.is_transaction === true && result.amount > 0) {
          // 添加记账记录
          var record = {
            id: Date.now(),
            type: result.type || 'expense',
            amount: Math.round(result.amount * 1000) / 1000,
            category: result.category || '其他',
            subCategory: result.sub_category || '',
            description: result.description || '',
            location: result.location || '',
            time: this.formatTime(new Date()),
            raw: this.data.asrText,
            notebookId: this.data.currentNotebookId
          }

          var records = [record].concat(this.data.records)
          this.setData({ records: records })
          this.saveRecords()
          this.updateStats(records)
          this.filterRecords()

          wx.showToast({ title: '记账成功', icon: 'success' })
        }
      }
    } catch (e) {
      console.error('[记账] JSON 解析失败:', e, '| 原文:', jsonStr || answer)
    }
  },

  // ========== 记账数据管理 ==========

  loadRecords: function () {
    var that = this
    var notebookId = this.data.currentNotebookId
    wx.getStorage({
      key: 'account_records',
      success: function (res) {
        var allRecords = res.data || []
        // 只显示当前账本的记录
        var records = notebookId ? allRecords.filter(function (r) {
          return r.notebookId === notebookId
        }) : allRecords
        that.setData({ records: records })
        that.updateStats(records)
        that.filterRecords()
      }
    })
  },

  saveRecords: function () {
    var that = this
    var notebookId = this.data.currentNotebookId
    // 先读取全部记录，替换当前账本的记录，再保存
    wx.getStorage({
      key: 'account_records',
      success: function (res) {
        var allRecords = res.data || []
        // 移除当前账本的旧记录
        var otherRecords = allRecords.filter(function (r) {
          return r.notebookId !== notebookId
        })
        // 合并当前账本的新记录
        var merged = otherRecords.concat(that.data.records)
        wx.setStorage({
          key: 'account_records',
          data: merged
        })
      },
      fail: function () {
        // 没有历史记录，直接保存
        wx.setStorage({
          key: 'account_records',
          data: that.data.records
        })
      }
    })
  },

  updateStats: function (records) {
    var totalIncome = 0
    var totalExpense = 0
    var categoryMap = {}

    for (var i = 0; i < records.length; i++) {
      var r = records[i]
      if (r.type === 'income') {
        totalIncome += r.amount
      } else {
        totalExpense += r.amount
      }

      // 按大类聚合
      var key = r.type + '_' + r.category
      if (!categoryMap[key]) {
        categoryMap[key] = {
          type: r.type,
          category: r.category,
          amount: 0,
          count: 0,
          subCategories: {}  // 细类明细
        }
      }
      categoryMap[key].amount += r.amount
      categoryMap[key].count++

      // 记录细类
      var subCat = r.subCategory || '其他'
      if (!categoryMap[key].subCategories[subCat]) {
        categoryMap[key].subCategories[subCat] = 0
      }
      categoryMap[key].subCategories[subCat] += r.amount
    }

    var categoryStats = []
    for (var k in categoryMap) {
      // 把 subCategories 对象转成数组方便展示
      var stat = categoryMap[k]
      var subList = []
      for (var sk in stat.subCategories) {
        subList.push({ name: sk, amount: stat.subCategories[sk] })
      }
      subList.sort(function (a, b) { return b.amount - a.amount })
      stat.subList = subList
      categoryStats.push(stat)
    }
    // 按金额排序
    categoryStats.sort(function (a, b) { return b.amount - a.amount })

    this.setData({
      totalIncome: totalIncome,
      totalExpense: totalExpense,
      balance: totalIncome - totalExpense,
      categoryStats: categoryStats
    })

    // 生成饼状图数据（只展示支出分类）
    this.buildPieData(categoryStats, totalExpense)
  },

  // 大类固定配色（马卡龙色系）
  categoryColors: {
    '餐饮': '#fda4af',
    '交通': '#7dd3fc',
    '购物': '#fcd34d',
    '服饰': '#f9a8d4',
    '娱乐': '#c4b5fd',
    '住房': '#86efac',
    '医疗': '#a5f3fc',
    '教育': '#ddd6fe',
    '生活': '#fdba74',
    '社交': '#fecaca',
    '旅行': '#bae6fd',
    '运动': '#bbf7d0',
    '其他支出': '#e2e8f0',
    '工资': '#86efac',
    '奖金': '#7dd3fc',
    '兼职': '#fcd34d',
    '投资': '#c4b5fd',
    '红包': '#fda4af',
    '退款': '#a5f3fc',
    '其他收入': '#e2e8f0'
  },
  // 备用颜色
  fallbackColors: ['#fda4af', '#fcd34d', '#86efac', '#7dd3fc', '#c4b5fd', '#f9a8d4', '#fdba74', '#a5f3fc', '#ddd6fe', '#fecaca'],

  buildPieData: function (categoryStats, totalExpense) {
    var colorMap = this.categoryColors
    var fallback = this.fallbackColors
    var pieData = []
    var expenseStats = categoryStats.filter(function (s) { return s.type === 'expense' })

    for (var i = 0; i < expenseStats.length; i++) {
      var s = expenseStats[i]
      var percent = totalExpense > 0 ? Math.round((s.amount / totalExpense) * 100) : 0
      var color = colorMap[s.category] || fallback[i % fallback.length]

      // 构造细类描述
      var subText = ''
      if (s.subList && s.subList.length > 0) {
        var names = s.subList.map(function (sub) { return sub.name }).join('、')
        subText = ' (' + names + ')'
      }

      pieData.push({
        name: s.category,
        value: s.amount,
        percent: percent,
        color: color,
        subText: subText
      })
    }

    this.setData({ pieData: pieData })
    // 延迟绘制，等 canvas DOM 渲染完成
    var that = this
    setTimeout(function () {
      that.drawPieChart()
    }, 300)
  },

  drawPieChart: function () {
    var pieData = this.data.pieData
    if (!pieData || pieData.length === 0) {
      console.log('[饼图] 无数据，跳过绘制')
      return
    }

    console.log('[饼图] 开始绘制, 数据:', JSON.stringify(pieData))

    var query = wx.createSelectorQuery()
    query.select('#pieChart')
      .fields({ node: true, size: true })
      .exec(function (res) {
        console.log('[饼图] selectorQuery 结果:', JSON.stringify(res))

        if (!res || !res[0]) {
          console.error('[饼图] 未找到 canvas 节点，可能 DOM 未渲染')
          return
        }

        if (!res[0].node) {
          console.error('[饼图] canvas node 为空')
          return
        }

        if (!res[0].width || !res[0].height) {
          console.error('[饼图] canvas 尺寸为 0, width:', res[0].width, 'height:', res[0].height)
          return
        }

        var canvas = res[0].node
        var ctx = canvas.getContext('2d')
        var dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)

        var width = res[0].width
        var height = res[0].height
        var cx = width / 2
        var cy = height / 2
        var radius = Math.min(width, height) / 2 - 8

        var total = 0
        for (var i = 0; i < pieData.length; i++) {
          total += pieData[i].value
        }
        if (total === 0) {
          console.error('[饼图] total 为 0')
          return
        }

        console.log('[饼图] canvas 尺寸:', width, 'x', height, '| radius:', radius, '| total:', total)

        var startAngle = -Math.PI / 2

        for (var j = 0; j < pieData.length; j++) {
          var item = pieData[j]
          var angle = (item.value / total) * Math.PI * 2

          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.arc(cx, cy, radius, startAngle, startAngle + angle)
          ctx.closePath()
          ctx.fillStyle = item.color
          ctx.fill()

          startAngle += angle
        }

        // 中心圆（甜甜圈效果）
        ctx.beginPath()
        ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        ctx.fill()

        // 中心文字
        ctx.fillStyle = '#475569'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('支出', cx, cy - 8)
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText('¥' + total, cx, cy + 10)

        console.log('[饼图] 绘制完成')
      })
  },

  filterRecords: function () {
    var tab = this.data.activeTab
    var records = this.data.records
    var filtered = records

    if (tab === 'expense') {
      filtered = records.filter(function (r) { return r.type === 'expense' })
    } else if (tab === 'income') {
      filtered = records.filter(function (r) { return r.type === 'income' })
    }

    this.setData({ filteredRecords: filtered })
  },

  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.filterRecords()
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
          that.saveRecords()
          that.updateStats(records)
          that.filterRecords()
        }
      }
    })
  },

  formatTime: function (date) {
    var y = date.getFullYear()
    var m = (date.getMonth() + 1).toString().padStart(2, '0')
    var d = date.getDate().toString().padStart(2, '0')
    var h = date.getHours().toString().padStart(2, '0')
    var min = date.getMinutes().toString().padStart(2, '0')
    return y + '-' + m + '-' + d + ' ' + h + ':' + min
  },

  // ========== 语音播放 ==========

  onPlayAudio: function () {
    if (!this.localAudioPath) {
      wx.showToast({ title: '没有录音', icon: 'none' })
      return
    }

    var that = this
    if (this.audioContext) {
      this.audioContext.stop()
      this.audioContext.destroy()
      this.audioContext = null
      this.setData({ playingIndex: -1 })
      return
    }

    this.audioContext = wx.createInnerAudioContext()
    this.audioContext.src = this.localAudioPath
    this.setData({ playingIndex: 0 })

    this.audioContext.onEnded(function () {
      that.setData({ playingIndex: -1 })
    })
    this.audioContext.onError(function () {
      that.setData({ playingIndex: -1 })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })

    this.audioContext.play()
  },

  // ========== 导航抽屉 ==========

  openDrawer: function () {
    this.setData({ drawerVisible: true })
  },

  closeDrawer: function () {
    this.setData({ drawerVisible: false })
  },

  onNavigate: function (e) {
    var path = e.detail.path
    if (path === '/pages/index/index') return
    wx.redirectTo({ url: path })
  },

  goToNotebooks: function () {
    wx.navigateTo({ url: '/pages/notebooks/notebooks' })
  },

  // ========== 文本输入 ==========

  onTextInput: function () {
    if (this.data.loading || this.data.recording) return
    this.setData({ textInputVisible: true, textInputValue: '' })
  },

  onTextInputChange: function (e) {
    this.setData({ textInputValue: e.detail.value })
  },

  onTextInputConfirm: function () {
    var text = (this.data.textInputValue || '').trim()
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }

    this.setData({
      textInputVisible: false,
      asrText: text,
      loading: true,
      loadingText: 'AI 正在分析...'
    })
    this.callHY3(text)
  },

  onTextInputCancel: function () {
    this.setData({ textInputVisible: false })
  },

  onModalStop: function () {},

  onTagTap: function (e) {
    var type = e.currentTarget.dataset.type
    var value = e.currentTarget.dataset.value

    // 用全局变量传参，避免 URL 编码问题
    app.tagFilterData = {
      filterType: type === 'time' ? 'date' : 'location',
      filterValue: type === 'time' ? value.substring(0, 10) : value
    }

    wx.navigateTo({ url: '/pages/records/records' })
  }
})
