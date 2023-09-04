let isOwner = (ip) => ips().includes(ip)

window.api.updateNicks((sender, data) => {
  let frag = document.createDocumentFragment()
  nick = Object.keys(data).filter(k => isOwner(data[k].ip))[0]

  //console.log(data);

  Object.keys(data).filter(k => !isOwner(data[k].ip)).forEach(name => {
    frag.appendChild(renderUser($(selectors.userListTemplate).content, name))
  })

  $(selectors.userList).innerHTML = ''
  $(selectors.userList).appendChild(frag)
})

window.api.updateMessages(async (sender, data) => {
  if(to !== data.from) {
    to = data.from
    $(selectors.topic).textContent = setChatTopic(nick, to)
  }

  if(data.blurred) new Notification(`Message from ${data.from}`, { title: `Message from ${data.from}`, body: data.text })

  let el = createNewConversation($(selectors.conversationTemplate).content, data.from, await window.api.jsesc(JSON.parse(data.text)))
  $(selectors.chatWrapper).appendChild(el)
});

$(selectors.userList).addEventListener('click', (e) => {
  let li;

  if(e.target.tagName == "A") li = e.target.closest('li')
  else if(e.target.tagName == "LI") li = e.target

  if(li) {
    $(selectors.chatBoxInputWrapper).classList.add('show')

    to = li.dataset.id
    window.api.initiateExchange(nick, to, () => {
      $(selectors.topic).textContent = setChatTopic(nick, to)
    })
  }
})

$(selectors.submitButton).addEventListener('click', async () => {
  let value = $(selectors.inputBox).value;

  if(!(value && to && nick)) return

  window.api.sendMessage(nick, to, await window.api.jsesc(value))

  let el = createNewConversation($(selectors.conversationTemplate).content, nick, await window.api.jsesc(value))
  $(selectors.chatWrapper).appendChild(el)
  $(selectors.inputBox).value = ''
})

window.onload = function() {
  window.api.getUser().then(async name => {
    nick = await window.api.jsesc(name)
    $(selectors.userName).textContent = nick
  }).then(() => {
    return Promise.all([window.api.userServer(), window.api.broadCastServer(nick)])
  }).then(() => window.api.setUp())
    .then(() => {
      if(window.location.hash) routeChange(window.location.hash)
    })
}

window.onhashchange = function() {
  routeChange(window.location.hash ? window.location.hash : '#user-name')
}

$(selectors.changeNameForm).addEventListener('submit', (e) => {
  e.preventDefault()
  let value = $(selectors.changeName).value

  if(value) {
    window.api.getUser(value).then(async name => {
      window.api.updateNick(nick, name)
      nick = await window.api.jsesc(name)
    }).then(() => {
      routeChange('#chat-window')
    })
  }
})
