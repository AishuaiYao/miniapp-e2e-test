var app = getApp()

Page({
  data: {
    messages: [
      { role: 'assistant', content: '你好，有什么可以帮你？' }
    ],
    inputText: '',
    loading: false
  },

  onInput: function (e) {
    this.setData({ inputText: e.detail.value })
  },

  onSend: function () {
    var text = this.data.inputText.trim()
    console.log('[onSend] 输入文本:', text, '| loading:', this.data.loading)
    if (!text || this.data.loading) {
      console.log('[onSend] 跳过发送：text为空或正在加载中')
      return
    }

    var msgs = this.data.messages.concat([
      { role: 'user', content: text },
      { role: 'assistant', content: '' }
    ])
    this.setData({
      messages: msgs,
      inputText: '',
      loading: true
    })
    console.log('[onSend] 已更新消息列表，当前共', msgs.length, '条')

    var that = this
    var lastIndex = msgs.length - 1
    var answer = ''
    var chunkCount = 0
    var startTime = Date.now()

    try {
      console.log('[onSend] 开始调用 wx.cloud.extend.AI.createModel...')
      console.log('[onSend] 检查 wx.cloud:', !!wx.cloud, '| wx.cloud.extend:', !!(wx.cloud && wx.cloud.extend), '| wx.cloud.extend.AI:', !!(wx.cloud && wx.cloud.extend && wx.cloud.extend.AI))

      var model = wx.cloud.extend.AI.createModel('cloudbase')
      console.log('[onSend] createModel 成功，model:', model)

      var requestData = {
        model: 'hy3-preview',
        messages: [
          {
            role: 'system',
            content: '你是简洁的AI助手，每次回答不超过50个字。'
          },
          { role: 'user', content: text }
        ]
      }
      console.log('[onSend] 准备调用 streamText（Promise模式），请求数据:', JSON.stringify(requestData))

      // 超时检测：15秒无响应则告警
      var timeoutFlag = true
      var timeoutTimer = setTimeout(function () {
        if (timeoutFlag) {
          console.error('[超时] streamText 调用后 15 秒无响应')
          console.error('[超时] 请检查：1)云环境ID是否正确 2)是否已开通AI+能力 3)网络是否正常')
          var key = 'messages[' + lastIndex + '].content'
          var obj = {}
          obj[key] = '请求超时：15秒内未收到大模型响应，请检查云环境和AI能力配置'
          that.setData(obj)
          that.setData({ loading: false })
        }
      }, 15000)

      // streamText 返回 Promise，用 async/await 处理
      ;(async function () {
        try {
          console.log('[streamText] 开始 await model.streamText...')
          var res = await model.streamText({ data: requestData })
          console.log('[streamText] await 返回，耗时:', Date.now() - startTime, 'ms')
          console.log('[streamText] 响应对象 keys:', Object.keys(res || {}))
          console.log('[streamText] textStream 类型:', typeof res.textStream, '| 是否存在:', !!res.textStream)

          timeoutFlag = false
          clearTimeout(timeoutTimer)

          console.log('[stream] 开始遍历 textStream...')
          for await (var chunk of res.textStream) {
            chunkCount++
            console.log('[stream] chunk #' + chunkCount + ':', JSON.stringify(chunk), '| 长度:', chunk ? chunk.length : 0)
            answer += chunk
            var key = 'messages[' + lastIndex + '].content'
            var obj = {}
            obj[key] = answer
            that.setData(obj)
          }
          console.log('[stream] 遍历完成，共收到', chunkCount, '个chunk，最终回答:', answer)
          console.log('[stream] 总耗时:', Date.now() - startTime, 'ms')
          that.setData({ loading: false })
        } catch (err) {
          timeoutFlag = false
          clearTimeout(timeoutTimer)
          console.error('[streamText error] 调用失败，耗时:', Date.now() - startTime, 'ms')
          console.error('[streamText error] 错误对象:', err)
          console.error('[streamText error] err.message:', err && err.message)
          var key = 'messages[' + lastIndex + '].content'
          var obj = {}
          obj[key] = '出错了：' + (err.message || err.errMsg || '未知错误')
          that.setData(obj)
          that.setData({ loading: false })
        }
      })()
      console.log('[onSend] streamText 已调用（async），等待 Promise resolve...')
    } catch (e) {
      console.error('[onSend 异常] 捕获到同步异常:', e)
      console.error('[onSend 异常] e.message:', e && e.message)
      console.error('[onSend 异常] e.stack:', e && e.stack)
      var key = 'messages[' + lastIndex + '].content'
      var obj = {}
      obj[key] = '异常：' + (e.message || '未知错误')
      that.setData(obj)
      that.setData({ loading: false })
    }
  }
})
