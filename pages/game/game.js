const ROLE_NAMES = {
  wolf: '狼人',
  villager: '村民',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫'
}

function shuffle(items) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

function shuffledCards(config) {
  const cards = []
  Object.keys(config.roleCounts).forEach((key) => {
    for (let i = 0; i < config.roleCounts[key]; i += 1) cards.push(ROLE_NAMES[key])
  })
  return config.players.map((player, index) => ({
    seat: player.seat,
    name: player.name,
    role: cards[index],
    viewed: false,
    dead: false
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

function seatLabel(seats, seatNumber) {
  const seat = seats.find((item) => item.seat === Number(seatNumber))
  return seat ? `${seat.seat} 号${seat.name ? ` ${seat.name}` : ''}` : '未选择'
}

function saveSession(session) {
  getApp().globalData.activeGame = session
}

function makeNightRecord(night) {
  return { night, attackedSeat: '', guardSeat: '', witchSave: false, poisonSeat: '', seerSeat: '', seerResult: '', deathSeats: '' }
}

function makeVoteRecord(round) {
  return { round, eliminatedSeat: '', votes: '' }
}

Page({
  data: {
    seats: [],
    currentSeat: 1,
    currentSpeakerLabel: '1 号',
    speechOrderText: '',
    speechOrderHint: '',
    dayNumber: 1,
    sheriffSeat: '',
    viewMode: false,
    codeInput: '',
    activeCard: null,
    seconds: 60,
    remaining: 60,
    remainingText: '01:00',
    timerRunning: false,
    timerExpired: false,
    presets: [30, 60, 90, 120],
    seatOptions: [],
    sheriffOptions: [],
    nightRecords: [],
    nightIndex: 0,
    voteRecords: [],
    voteIndex: 0,
    nightRecord: makeNightRecord(1),
    voteRecord: makeVoteRecord(1)
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
      const seats = shuffledCards(config)
      session = {
        configStamp: JSON.stringify(config),
        seats,
        currentSeat: 1,
        speechOrder: shuffle(seats.map((seat) => seat.seat)),
        dayNumber: 1,
        sheriffSeat: '',
        nightRecords: [],
        voteRecords: [],
        timerRemaining: config.speechSeconds,
        timerDeadline: null,
        timerRunning: false,
        timerExpired: false
      }
      session.currentSeat = session.speechOrder[0]
      saveSession(session)
    }
    this.syncSession(session, config)
  },

  syncSession(session, config) {
    const nightRecords = session.nightRecords || []
    const voteRecords = session.voteRecords || []
    const nightIndex = Math.max(0, nightRecords.length - 1)
    const voteIndex = Math.max(0, voteRecords.length - 1)
    this.setData({
      seats: session.seats,
      currentSeat: session.currentSeat,
      currentSpeakerLabel: formatSpeaker(session.seats, session.currentSeat),
      speechOrderText: (session.speechOrder || []).map((seat) => seatLabel(session.seats, seat)).join(' → '),
      speechOrderHint: this.getSpeechHint(session),
      dayNumber: session.dayNumber || 1,
      sheriffSeat: session.sheriffSeat || '',
      seconds: config.speechSeconds,
      remaining: session.timerRemaining,
      remainingText: formatClock(session.timerRemaining),
      timerRunning: session.timerRunning,
      timerExpired: session.timerExpired,
      seatOptions: session.seats.map((seat) => `${seat.seat} 号${seat.name ? ` ${seat.name}` : ''}`),
      sheriffOptions: ['无警长'].concat(session.seats.map((seat) => `${seat.seat} 号${seat.name ? ` ${seat.name}` : ''}`)),
      nightRecords,
      nightIndex,
      nightRecord: nightRecords[nightIndex] || makeNightRecord((session.dayNumber || 1)),
      voteRecords,
      voteIndex,
      voteRecord: voteRecords[voteIndex] || makeVoteRecord(voteRecords.length + 1)
    })
  },

  getSpeechHint(session) {
    if ((session.dayNumber || 1) === 1) return '第一天：已随机生成发言顺序。'
    if (session.sheriffSeat) return `有警长：由${seatLabel(session.seats, session.sheriffSeat)}决定发言顺序。`
    const latest = (session.nightRecords || []).slice(-1)[0]
    const deaths = this.parseSeats(latest && latest.deathSeats)
    if (deaths.length > 2) return '无警长且死亡超过两人：已随机生成发言顺序。'
    if (deaths.length > 0) return '无警长：从死亡玩家左右开始发言，可由主持人调整。'
    return '无警长：请主持人根据现场情况选择发言顺序。'
  },

  onShow() { this.restoreTimer() },
  onHide() { this.clearTimerInterval() },
  onUnload() { this.clearTimerInterval() },
  getSession() { return getApp().globalData.activeGame },
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
      wx.showModal({ title: '发言时间到', content: `${session.currentSeat} 号玩家发言时间结束。确认后进入下一位。`, showCancel: false, confirmText: '进入下一位', success: () => this.nextSpeaker() })
      return
    }
    if (remaining !== this.data.remaining) this.setData({ remaining, remainingText: formatClock(remaining) })
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
    if (remaining === 0) return this.timerTick()
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
  selectSeat(seat) {
    const session = this.getSession()
    if (!session) return
    session.currentSeat = Number(seat)
    session.timerRemaining = this.data.seconds
    session.timerDeadline = null
    session.timerRunning = false
    session.timerExpired = false
    saveSession(session)
    this.clearTimerInterval()
    this.setData({ currentSeat: session.currentSeat, currentSpeakerLabel: formatSpeaker(this.data.seats, session.currentSeat), remaining: this.data.seconds, remainingText: formatClock(this.data.seconds), timerRunning: false, timerExpired: false })
  },
  chooseSpeaker(event) { this.selectSeat(Number(event.detail.value) + 1) },
  previousSpeaker() {
    const order = this.getSession().speechOrder || this.data.seats.map((seat) => seat.seat)
    const index = order.indexOf(this.data.currentSeat)
    this.selectSeat(order[(index - 1 + order.length) % order.length])
  },
  nextSpeaker() {
    const order = this.getSession().speechOrder || this.data.seats.map((seat) => seat.seat)
    const index = order.indexOf(this.data.currentSeat)
    this.selectSeat(order[(index + 1) % order.length])
  },
  codeInput(event) { this.setData({ codeInput: String(event.detail.value).replace(/\D/g, '').slice(0, 4) }) },
  enterViewMode() {
    const input = this.data.codeInput
    const app = getApp()
    if (!/^\d{4}$/.test(input)) return wx.showToast({ title: '请输入 4 位数字口令', icon: 'none' })
    if (!app.globalData.hostCode) return wx.showToast({ title: '口令仅保存在内存中，请重新开始本局', icon: 'none' })
    if (app.globalData.hostCode !== input) return wx.showToast({ title: '口令不正确', icon: 'none' })
    this.setData({ viewMode: true, codeInput: '' })
  },
  exitViewMode() { this.setData({ viewMode: false, activeCard: null, codeInput: '' }) },
  openCard(event) {
    if (!this.data.viewMode) return
    const index = Number(event.currentTarget.dataset.index)
    const seats = this.data.seats.slice()
    seats[index].viewed = true
    this.persistPatch({ seats })
    this.setData({ seats, activeCard: seats[index] })
  },
  closeCard() { this.setData({ activeCard: null }) },
  keepModalOpen() {},

  sheriffChange(event) {
    const value = Number(event.detail.value)
    const sheriffSeat = value === 0 ? '' : this.data.seats[value - 1].seat
    const session = this.getSession()
    session.sheriffSeat = sheriffSeat
    saveSession(session)
    this.setData({ sheriffSeat, speechOrderHint: this.getSpeechHint(session) })
  },
  clearSheriff() {
    const session = this.getSession()
    session.sheriffSeat = ''
    saveSession(session)
    this.setData({ sheriffSeat: '', speechOrderHint: this.getSpeechHint(session) })
  },
  randomizeFirstDay() {
    const session = this.getSession()
    session.dayNumber = 1
    session.speechOrder = shuffle(session.seats.map((seat) => seat.seat))
    session.currentSeat = session.speechOrder[0]
    saveSession(session)
    this.syncSession(session, wx.getStorageSync('lastConfig'))
  },
  startNextDay() {
    const session = this.getSession()
    session.dayNumber = (session.dayNumber || 1) + 1
    session.speechOrder = this.buildSuggestedOrder(session)
    session.currentSeat = session.speechOrder[0]
    saveSession(session)
    this.syncSession(session, wx.getStorageSync('lastConfig'))
  },
  buildSuggestedOrder(session) {
    const alive = session.seats.filter((seat) => !seat.dead).map((seat) => seat.seat)
    const latest = (session.nightRecords || []).slice(-1)[0]
    const deaths = this.parseSeats(latest && latest.deathSeats)
    if (deaths.length > 2 || deaths.length === 0) return shuffle(alive)
    const anchor = deaths[deaths.length - 1]
    const index = alive.indexOf(anchor)
    if (index < 0) return shuffle(alive)
    const left = alive[(index - 1 + alive.length) % alive.length]
    const right = alive[(index + 1) % alive.length]
    return [left, right].concat(alive.filter((seat) => seat !== left && seat !== right))
  },
  dayInput(event) {
    const dayNumber = Math.max(1, Number(event.detail.value) || 1)
    const session = this.getSession()
    session.dayNumber = dayNumber
    saveSession(session)
    this.setData({ dayNumber, speechOrderHint: this.getSpeechHint(session) })
  },
  parseSeats(value) {
    return String(value || '').split(/[,，、\s]+/).map((item) => Number(item)).filter((seat, index, list) => seat >= 1 && seat <= this.data.seats.length && list.indexOf(seat) === index)
  },
  updateNightField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`nightRecord.${field}`]: event.detail.value })
  },
  toggleNightSave(event) { this.setData({ 'nightRecord.witchSave': event.detail.value }) },
  saveNightRecord() {
    const record = Object.assign({}, this.data.nightRecord, { night: Number(this.data.nightRecord.night) || this.data.dayNumber })
    const deaths = this.parseSeats(record.deathSeats)
    const session = this.getSession()
    const seats = session.seats.map((seat) => Object.assign({}, seat, { dead: seat.dead || deaths.includes(seat.seat) }))
    const records = (session.nightRecords || []).slice()
    const index = this.data.nightIndex
    records[index] = record
    session.nightRecords = records
    session.seats = seats
    session.speechOrder = session.dayNumber === 1 ? session.speechOrder : this.buildSuggestedOrder(session)
    saveSession(session)
    this.syncSession(session, wx.getStorageSync('lastConfig'))
    wx.showToast({ title: '夜间信息已保存', icon: 'none' })
  },
  newNightRecord() {
    const session = this.getSession()
    const records = session.nightRecords || []
    records.push(makeNightRecord(records.length + 1))
    session.nightRecords = records
    saveSession(session)
    this.syncSession(session, wx.getStorageSync('lastConfig'))
  },
  chooseNightRecord(event) {
    const index = Number(event.detail.value)
    const record = this.data.nightRecords[index] || makeNightRecord(index + 1)
    this.setData({ nightIndex: index, nightRecord: record })
  },
  updateVoteField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`voteRecord.${field}`]: event.detail.value })
  },
  chooseVoteEliminated(event) { this.setData({ 'voteRecord.eliminatedSeat': this.data.seats[Number(event.detail.value)].seat }) },
  saveVoteRecord() {
    const record = Object.assign({}, this.data.voteRecord, { round: Number(this.data.voteRecord.round) || 1 })
    const session = this.getSession()
    const records = (session.voteRecords || []).slice()
    records[this.data.voteIndex] = record
    session.voteRecords = records
    if (record.eliminatedSeat) session.seats = session.seats.map((seat) => Object.assign({}, seat, { dead: seat.dead || seat.seat === Number(record.eliminatedSeat) }))
    saveSession(session)
    this.syncSession(session, wx.getStorageSync('lastConfig'))
    wx.showToast({ title: '投票信息已保存', icon: 'none' })
  },
  newVoteRecord() {
    const session = this.getSession()
    const records = session.voteRecords || []
    records.push(makeVoteRecord(records.length + 1))
    session.voteRecords = records
    saveSession(session)
    this.syncSession(session, wx.getStorageSync('lastConfig'))
  },
  chooseVoteRecord(event) {
    const index = Number(event.detail.value)
    this.setData({ voteIndex: index, voteRecord: this.data.voteRecords[index] || makeVoteRecord(index + 1) })
  },

  reshuffle() {
    wx.showModal({ title: '重新洗牌', content: '将清除全部身份查看状态、警长、夜间与投票记录，并从 1 号玩家重新开始。', confirmText: '重新洗牌', success: (result) => {
      if (!result.confirm) return
      const config = wx.getStorageSync('lastConfig')
      const session = this.getSession()
      session.seats = shuffledCards(config)
      session.speechOrder = shuffle(session.seats.map((seat) => seat.seat))
      session.currentSeat = session.speechOrder[0]
      session.dayNumber = 1
      session.sheriffSeat = ''
      session.nightRecords = []
      session.voteRecords = []
      session.timerRemaining = config.speechSeconds
      session.timerDeadline = null
      session.timerRunning = false
      session.timerExpired = false
      saveSession(session)
      this.clearTimerInterval()
      this.setData({ viewMode: false, activeCard: null })
      this.syncSession(session, config)
    } })
  },
  endGame() {
    wx.showModal({ title: '结束本局', content: '确定结束并清除本局身份、查看状态、警长和记录？最近配置会保留。', confirmText: '结束本局', success: (result) => {
      if (!result.confirm) return
      this.clearTimerInterval()
      getApp().globalData.activeGame = null
      getApp().globalData.hostCode = ''
      wx.navigateBack({ delta: 2 })
    } })
  }
})
