
const express = require("express");
const app = express();
const hostname = "0.0.0.0";
const port = 80;
const path = require('path');
const http = require('http').Server(app);
const io = require("socket.io")(http);

app.use(express.static(path.resolve(__dirname, '.')));

function criarCartasNaipe (baralho, naipe) {
    for (let i = 1; i <= 13; i++) {
        let label = null;

        switch (i) {
            case 1:
                label = 'A';
                break;
            case 11:
                label = 'J';
                break;
            case 12:
                label = 'Q';
                break;
            case 13:
                label = 'K';
                break;
            default:
                label = String(i);
                break;
        }

        baralho.push({
            label: label,
            value: i,
            naipe: naipe
        });
    }
}

const baralhoRef = [];

criarCartasNaipe(baralhoRef, 'Copas');
criarCartasNaipe(baralhoRef, 'Copas');
criarCartasNaipe(baralhoRef, 'Paus');
criarCartasNaipe(baralhoRef, 'Paus');
criarCartasNaipe(baralhoRef, 'Ouros');
criarCartasNaipe(baralhoRef, 'Ouros');
criarCartasNaipe(baralhoRef, 'Espadas');
criarCartasNaipe(baralhoRef, 'Espadas');

const rooms = [];
const players = [];



function shuffleArray(d) {
    let arr = d.slice(),
        length = arr.length,
        temp,
        i;

    while(length){
        i = Math.floor(Math.random() * length--);

        temp = arr[length];
        arr[length] = arr[i];
        arr[i] = temp;
    }

    return arr;
};

io.on('connection', (client) => {
    let player = {
        id: client.id,
        name: '',
        cards: [],
        downs: [],
        winner: false
    };

    players.push(player);

    function enterRoom (name) {
        let room = rooms.find(room => room.name === name);

        if (room === undefined) {
            room = {
                name: name,
                players: [],
                playing: false,
                owner: player,
                trash: [],
                baralho: [],
                playerTurn: null
            };

            rooms.push(room);
            rooms.sort((a, b) => {
                if (a.name > b.name) {
                    return 1;
                }

                if (a.name < b.name) {
                    return -1;
                }

                return 0;
            });


        }

        function isTrinca(cards) {
            return cards[1].value === cards[0].value
                && cards[1].value === cards[2].value
                && cards[1].naipe !== cards[0].naipe
                && cards[1].naipe !== cards[2].naipe
                && cards[0].naipe !== cards[2].naipe
        }

        function isSequencia(cards) {
            return cards[1].naipe === cards[0].naipe
                && cards[1].naipe === cards[2].naipe
                && cards[0].value + 1 === cards[1].value
                && cards[1].value + 1 === cards[2].value
        }

        function basicInfos() {
            client.to(room.name).emit('baralho-cards-total', room.baralho.length);
            client.emit('baralho-cards-total', room.baralho.length);



            client.to(room.name).emit('players-cards', room.players);
            client.emit('players-cards', room.players);
            client.in(room.name).emit('room-players', room.players);
            client.emit('room-players', room.players);

        }

        function nextTurn() {
            if (room.playerTurn === null || room.players.indexOf(room.playerTurn) === room.players.length - 1) {
                room.playerTurn = room.players.find(() => true);
            } else {
                room.playerTurn = room.players[room.players.indexOf(room.playerTurn) + 1];
            }


            client.to(room.name).emit('next-turn', room.playerTurn);
            client.emit('next-turn', room.playerTurn);
            console.log(room.playerTurn)
        }

        function startGame () {
            room.playing = true;
            client.emit('show-rooms', rooms.map(room => ({ name: room.name, players: room.players.length, playing: room.playing })))
            client.broadcast.emit('show-rooms', rooms.map(room => ({ name: room.name, players: room.players.length, playing: room.playing })))


            if (player === room.owner) {
                console.log('hudisko')
                for (let o = 0, length = room.players.length; o < length; o++) {
                    const pl = room.players[o];
                    for (let i = 0; i < 9; i++) {
                        pl.cards.push(room.baralho.shift());
                        console.log(room.baralho.length)
                    }
                }

            }

            basicInfos();
            setInterval(() => {

                console.log(room.baralho.length)
            }, 2000)
            nextTurn();
        }


        room.players.push(player);

        client.broadcast.emit('show-rooms', rooms.map(room => ({ name: room.name, players: room.players.length, playing: room.playing })));
        client.once('start-game', () => {
            room.baralho = shuffleArray(shuffleArray(shuffleArray(baralhoRef.slice(0))));
            room.trash = [];
            startGame();
            client.to(room.name).emit('start-game');
            client.emit('start-game')
        });

        client.join(room.name);
        client.in(room.name).emit('room-players', room.players);
        client.in(room.name).emit('room-leader', room.owner)

        client.once('leave-room', () => {
            client.broadcast.in(room.name).emit('leaving-room', player);
            client.leave(room.name);
            room.players = room.players.filter(playerroom => playerroom !== player);
            player.cards = [];
            player.downs = [];

            if (player === room.owner && room.players.length > 0) {
                room.owner = room.players.find(() => true);

                client.off('start-game');
            }

            client.emit('show-rooms', rooms.map(room => ({ name: room.name, players: room.players.length, playing: room.playing })))
            client.broadcast.emit('show-rooms', rooms.map(room => ({ name: room.name, players: room.players.length, playing: room.playing })))
            client.once('enter-room', enterRoom);
        });

        client.on('discard-card', (card) => {
            card = player.cards.find(c => c.value === card.value && c.naipe === card.naipe);
            room.trash.push(card);
            player.cards.splice(player.cards.indexOf(card), 1);
            basicInfos();
            client.to(room.name).emit('last-trash-card', room.trash[room.trash.length - 1]);
            client.emit('last-trash-card', room.trash[room.trash.length - 1]);

        });


        client.on('buy-card', () => {
            const card = room.baralho.shift();
            player.cards.push(card);
            client.emit('buy-card', card);
            console.log(card);
            basicInfos();
        });

        client.on('down-cards', (cards) => {
            cards = cards.sort((a, b) => {
                if (a.value > b.value) {
                    return 1;
                }

                if (a.value < b.value) {
                    return -1;
                }

                return 0;
            })

            if (isTrinca(cards) || isSequencia(cards)) {
                client.emit('down-cards', true)
                player.downs.push(cards);
                player.cards = player.cards.filter(card => cards.find(c => c.naipe === card.naipe && c.value === card.value) === undefined)
                basicInfos();
            } else {
                client.emit('down-cards', false)
            }
        })

        client.on('pass-turn', () => {
            client.broadcast.to(room.name).emit('pass-turn');
            basicInfos();
            nextTurn();
        });

        client.on('drop-card', (card) => {
            card = player.cards.find(cardCurrent => card.value == cardCurrent.value && card.naipe == cardCurrent.naipe);
            player.cards.splice(player.cards.indexOf(card), 1);

            room.trash.push(card);
            basicInfos();
        });

    };


    client.once('enter-name', name => {
        player.name = name;
        client.emit('show-rooms', rooms.map(room => ({ name: room.name, players: room.players.length, playing: room.playing }) ));
        client.once('enter-room', enterRoom);
    });

    client.on('disconnect', () => {
        players.splice(players.indexOf(player), 1);
        rooms.forEach(room => {
            if (room.players.indexOf(player) > -1) {
                room.players.splice(room.players.indexOf(player), 1);
            }
        });

        player = null;
    });

    // setInterval(() => {
    //     client.emit('test', { rooms, players });
    // }, 5000);
});


http.listen(port, hostname);