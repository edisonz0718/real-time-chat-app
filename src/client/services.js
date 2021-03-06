import io from "socket.io-client";

import {ObservableSocket} from "shared/observable-socket";
import {UsersStore} from "./stores/users";
import {ChatStore} from "./stores/chat";
import {PlaylistStore} from "./stores/playlist";
export const socket = io({autoConnect : false}); // connect in app.js
export const server = new ObservableSocket(socket);
// create socket wrapper

//create playlist store
//create user store
export const usersStore = new UsersStore(server);
//create chat store
export const chatStore = new ChatStore(server, usersStore);
export const playlistStore = new PlaylistStore(server);