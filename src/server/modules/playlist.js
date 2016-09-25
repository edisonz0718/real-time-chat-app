import {Observable} from "rxjs";
import _ from "lodash";

import {ModuleBase} from "../lib/module";

import {fail} from "shared/observable-socket";
import {validateAddSource} from "shared/validation/playlist";


export class PlaylistModule extends ModuleBase {
    constructor(io, usersModule, playlistRepository, videoServices){
        super();
        this._io = io;
        this._users = usersModule;
        this._repository = playlistRepository;
        this._services = videoServices;
        
        this._nextSourceId = 1;
        this._playlist =[];
        this._currentIdex = -1; // playlist's current index 
        this._currentSource = null;// source object
        this._currentTime = 0;
        
        setInterval(this._tickUpdateTime.bind(this),1000);
        setInterval(this._tickUpdateClients.bind(this),5000);
    }
    
    init$() {                             //equal: playlist =>this.setPlaylist(playlist)
        return this._repository.getAll$().do(this.setPlaylist.bind(this));
    }                                       //have to bind(this) b.c. otherwise this will be Observable
                                            //When using the upper one, it has arrow function to fix this. 
                                            
    getSourceById(id){
        return _.find(this._playlist,{id});
    }                                        
                                                
                                            
    setPlaylist(playlist){
        this._playlist = playlist;
        
        for(let source of playlist)
            source.id = this._nextSourceId++;
            
        this._io.emit("playlist:list", this._playlist);
    }
    
    setCurrentSource(source){
        if(source == null){
            this._currentSource = null;
            this._currentIdex = this._currentTime = 0;
        } else {
            const newIndex = this._playlist.indexOf(source);
            if(newIndex === -1)
                throw new Error(`Cannont set current to source ${source.id} / ${source.title}, it was not found`);
           
            this._currentTime = 0;
            this._currentSource = source;
            this._currentIdex = newIndex;
        }
        
        this._io.emit("playlist:current", this._createCurrentEvent());
        console.log(`playlist: setting current to ${source ? source.title : "{nothing}"}`);
        
    }
    
    playNextSource() {
        if(!this._playlist.length){
            this.setCurrentSource(null);
            return;
        }
        if(this._currentIdex +1 >= this._playlist.length) //if current is the last, go back to the first one
            this.setCurrentSource(this._playlist[0]);
        else
            this.setCurrentSource(this._playlist[this._currentIdex + 1]);
        
    }
    
    addSourceFromUlr$(url) {
        const validator = validateAddSource(url);
        if(!validator)
            return validator.throw$();
            
        return new Observable(observer => {
            let getSource$ = null;
            
            for(let service of this._services){
                getSource$ = service.process$(url);
                
                if(getSource$)
                    break;
            }
            
            if(!getSource$)
                return fail(`No service accepted url ${url}`);
                
            getSource$
                .do(this.addSource.bind(this))
                .subscribe(observer); // this is the way to chain observable
        });
    }
    
    addSource(source) {
        source.id = this._nextSourceId++;
       
        let insertIndex = 0,
            afterId = -1;
        
        if(this._currentSource){
            afterId = this._currentSource.id;
            insertIndex = this._currentIdex + 1;
        }
        
        this._playlist.splice(insertIndex, 0 , source);
        this._io.emit("playlist:added",{source, afterId});
        
        if(!this._currentSource)
            this.setCurrentSource(source);
            
        console.log(`playlist: added ${source.title}`);
    }
    
    _tickUpdateTime() {
        if(this._currentSource == null){
            if(this._playlist.length)
                this.setCurrentSource(this._playlist[0]);
        } else {
            this._currentTime++;
            if(this._currentTime > this._currentSource.totalTime + 2)
                this.playNextSource();
        }
    }
    
    _tickUpdateClients() {
        this._io.emit("playlist:current", this._createCurrentEvent());
    }
    
    _createCurrentEvent() {
        return this._currentSource
            ? {
                id: this._currentSource.id,
                time: this._currentTime
            } : {
                id: null,
                time: 0
            };
    }
    
    deleteSourceById(id){
        const source = this.getSourceById(id);
        
        if(!source)
            throw new Error(`Cannot find source ${id}`);
        
        const sourceIndex = this._playlist.indexOf(source);
 
        
        
        if(source == this._currentSource)
            if(this._playlist.length == 1)
                this.setCurrentSource(null);
            else
                this.playNextSource();
                
        this._playlist.splice(sourceIndex, 1);
        if(this._currentSource)// in case there is no more item in playlist
            this._currentIdex = this._playlist.indexOf(this._currentSource);
        this._io.emit("playlist:removed", {id});
        console.log(`playlist: deleted ${source.title}`);
    }
    
    registerClient(client) {
        const isLoggedIn = () => this._users.getUserForClient(client) !==null;
        
        client.onActions({
            "playlist:list": ()=>{
                return this._playlist;
            },
            
            "playlist:current": () => {
                return this._createCurrentEvent();       
            },
            "playlist:add": ({url}) =>{
                if(!isLoggedIn())
                    return fail("You mush be logged in to do that");
                    
                return this.addSourceFromUlr$(url);
            },
            
            "playlist:set-current": ({id}) => {
                if(!isLoggedIn())
                    return fail("You must be logged in to do that");
                    
                const source = this.getSourceById(id);
                if(!source)
                    return fail(`Cannot find source ${id}`);
                    
                this.setCurrentSource(source);
            },
            
            "playlist:remove": ({id})=>{
                if(!isLoggedIn())
                    return fail("You must be logged in to do that");
                    
                this.deleteSourceById(id);
            }
        });
    }
}