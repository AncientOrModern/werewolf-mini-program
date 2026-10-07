const ROLE_NAMES = {
  wolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫'
}


function shuffledCards(config) {
  const cards = []
  Object.keys(config.roleCounts).forEach((key) => {
    for (let i = 0; i < config.roleCounts[key]; i += 1) cards.push(ROLE_NAMES[key])
  })
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = cards[i]
    cards[i] = cards[j]
    cards[j] = temp
  }
  return config.players.map((player, index) => ({
    seat: player.seat,
    name: player.name,
    role: cards[index],
    viewed: false
  }))
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatSpeaker(seats, seatNumber) {
  const seat = seats[seatNumber - 1]
  return `${seatNumber} 号${seat && seat.name ? ` · ${seat.name}` : ''}`
}

function saveSession(session) {
  getApp().globalData.activeGame = session
}

Page({
  data: {
    seats: [],
    currentSeat: 1,
    currentSpeakerLabel: '1 号',
    viewMode: false,
    codeInput: '',
    activeCard: null,
    seconds: 60,
    remaining: 60,
    remainingText: '01:00',
    timerRunning: false,
    timerExpired: false,
    presets: [30, 60, 90, 120],
    seatOptions: []
  },

  onLoad() {
    const config = wx.getStorageSync('lastConfig')
    if (!config) {
      wx.showToast({ title: '没有找到游戏配置', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    let session = getApp().globalData.activeGame
    if (!session || session.configStamp !== JSON.stringify(config)) {
      session = {
        configStamp: JSON.stringify(config),
        seats: shuffledCards(config),
        currentSeat: 1,
        timerRemaining: config.speechSeconds,
        timerDeadline: null,
        timerRunning: false,
        timerExpired: false
      }
      saveSession(session)
    }
    this.setData({
      seats: session.seats,
      currentSeat: session.currentSeat,
      currentSpeakerLabel: formatSpeaker(session.seats, session.currentSeat),
      seconds: config.speechSeconds,
      remaining: session.timerRemaining,
      remainingText: formatClock(session.timerRemaining),
      timerRunning: session.timerRunning,
      timerExpired: session.timerExpired,
      seatOptions: session.seats.map((seat) => `${seat.seat} 号${seat.name ? ` ${seat.name}` : ''}`)
    })
  },

  onShow() {
    this.restoreTimer()
  },

  onHide() {
    this.clearTimerInterval()
  },

  onUnload() {
    this.clearTimerInterval()
  },

  getSession() {
    return getApp().globalData.activeGame
  },

  persistPatch(patch) {
    const session = this.getSession()
    if (!session) return
    Object.assign(session, patch)
    saveSession(session)
  },

  clearTimerInterval() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  },

  restoreTimer() {
    const session = this.getSession()
    if (!session || !session.timerRunning || !session.timerDeadline) return
    this.timerTick()
    const refreshed = this.getSession()
    if (refreshed && refreshed.timerRunning) this.timerInterval = setInterval(() => this.timerTick(), 250)
  },

  timerTick() {
    const session = this.getSession()
    if (!session || !session.timerRunning || !session.timerDeadline) return
    const remaining = Math.max(0, Math.ceil((session.timerDeadline - Date.now()) / 1000))
    if (remaining <= 0) {
      session.timerRemaining = 0
      session.timerDeadline = null
      session.timerRunning = false
      session.timerExpired = true
      saveSession(session)
      this.clearTimerInterval()
      this.setData({ remaining: 0, remainingText: '00:00', timerRunning: false, timerExpired: true })
      wx.showModal({
        title: '发言时间到',
        content: `${session.currentSeat} 号玩家发言时间结束。确认后进入下一位。`,
        showCancel: false,
        confirmText: '进入下一位',
        success: () => this.nextSpeaker()
      })
      return
    }
    if (remaining !== this.data.remaining) {
      this.setData({ remaining, remainingText: formatClock(remaining) })
    }
  },

  choosePreset(event) {
    const seconds = Number(event.currentTarget.dataset.seconds)
    this.setData({ seconds, remaining: seconds, remainingText: formatClock(seconds), timerExpired: false })
    this.persistPatch({ timerRemaining: seconds, timerDeadline: null, timerRunning: false, timerExpired: false })
    this.clearTimerInterval()
  },

  startTimer() {
    if (this.data.timerRunning || this.data.timerExpired) return
    const session = this.getSession()
    const remaining = this.data.remaining || this.data.seconds
    session.timerRemaining = remaining
    session.timerDeadline = Date.now() + remaining * 1000
    session.timerRunning = true
    session.timerExpired = false
    saveSession(session)
    this.setData({ timerRunning: true, timerExpired: false })
    this.clearTimerInterval()
    this.timerInterval = setInterval(() => this.timerTick(), 250)
  },

  pauseTimer() {
    const session = this.getSession()
    if (!session || !session.timerRunning) return
    const remaining = Math.max(0, Math.ceil((session.timerDeadline - Date.now()) / 1000))
    if (remaining === 0) {
      session.timerRemaining = 1
      session.timerDeadline = Date.now() - 1
      session.timerRunning = true
      session.timerExpired = false
      saveSession(session)
      this.timerTick()
      return
    }
    session.timerRemaining = remaining
    session.timerDeadline = null
    session.timerRunning = false
    session.timerExpired = false
    saveSession(session)
    this.clearTimerInterval()
    this.setData({ remaining, remainingText: formatClock(remaining), timerRunning: false, timerExpired: false })
  },

  resetTimer() {
    const session = this.getSession()
    if (!session) return
    session.timerRemaining = this.data.seconds
    session.timerDeadline = null
    session.timerRunning = false
    session.timerExpired = false
    saveSession(session)
    this.clearTimerInterval()
    this.setData({ remaining: this.data.seconds, remainingText: formatClock(this.data.seconds), timerRunning: false, timerExpired: false })
  },

  chooseSpeaker(event) {
    const index = Number(event.detail.value)
    const currentSeat = index + 1
    this.persistPatch({
      currentSeat,
      timerRemaining: this.data.seconds,
      timerDeadline: null,
      timerRunning: false,
      timerExpired: false
    })
    this.clearTimerInterval()
    this.setData({
      currentSeat,
      currentSpeakerLabel: formatSpeaker(this.data.seats, currentSeat),
      remaining: this.data.seconds,
      remainingText: formatClock(this.data.seconds),
      timerRunning: false,
      timerExpired: false
    })
  },

  nextSpeaker() {
    const nextSeat = this.data.currentSeat % this.data.seats.length + 1
    this.persistPatch({
      currentSeat: nextSeat,
      timerRemaining: this.data.seconds,
      timerDeadline: null,
      timerRunning: false,
      timerExpired: false
    })
    this.clearTimerInterval()
    this.setData({
      currentSeat: nextSeat,
      currentSpeakerLabel: formatSpeaker(this.data.seats, nextSeat),
      remaining: this.data.seconds,
      remainingText: formatClock(this.data.seconds),
      timerRunning: false,
      timerExpired: false
    })
  },

  codeInput(event) {
    this.setData({ codeInput: String(event.detail.value).replace(/\D/g, '').slice(0, 4) })
  },

  enterViewMode() {
    const input = this.data.codeInput
    if (!/^\d{4}$/.test(input)) {
      wx.showToast({ title: '请输入 4 位数字口令', icon: 'none' })
      return
    }
    const app = getApp()
    if (!app.globalData.hostCode) {
      wx.showToast({ title: '口令仅保存在内存中，请重新开始本局', icon: 'none' })
      return
    }
    if (app.globalData.hostCode !== input) {
      wx.showToast({ title: '口令不正确', icon: 'none' })
      return
    }
    this.setData({ viewMode: true, codeInput: '' })
  },

  exitViewMode() {
    this.setData({ viewMode: false, activeCard: null, codeInput: '' })
  },

  openCard(event) {
    if (!this.data.viewMode) return
    const index = Number(event.currentTarget.dataset.index)
    const seats = this.data.seats.slice()
    seats[index].viewed = true
    this.persistPatch({ seats })
    this.setData({ seats, activeCard: seats[index] })
  },

  closeCard() {
    this.setData({ activeCard: null })
  },

  keepModalOpen() {},

  reshuffle() {
    wx.showModal({
      title: '重新洗牌',
      content: '将清除全部身份查看状态，并从 1 号玩家重新开始。',
      confirmText: '重新洗牌',
      success: (result) => {
        if (!result.confirm) return
        const config = wx.getStorageSync('lastConfig')
        const session = this.getSession()
        session.seats = shuffledCards(config)
        session.currentSeat = 1
        session.timerRemaining = config.speechSeconds
        session.timerDeadline = null
        session.timerRunning = false
        session.timerExpired = false
        saveSession(session)
        this.clearTimerInterval()
        this.setData({
          seats: session.seats,
          currentSeat: 1,
          currentSpeakerLabel: formatSpeaker(session.seats, 1),
          viewMode: false,
          activeCard: null,
          seconds: config.speechSeconds,
          remaining: config.speechSeconds,
          remainingText: formatClock(config.speechSeconds),
          timerRunning: false,
          timerExpired: false
        })
      }
    })
  },

  endGame() {
    wx.showModal({
      title: '結束本局',
      content: '确定结束并清除本局身份与查看状态？最近配置会保留。',
      confirmText: '结束本局',
      success: (result) => {
        if (!result.confirm) return
        this.clearTimerInterval()
        getApp().globalData.activeGame = null
        getApp().globalData.hostCode = ''
        wx.navigateBack({ delta: 2 })
      }
    })
  }
})
