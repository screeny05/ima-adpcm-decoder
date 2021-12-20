import { Parser } from 'binary-parser';

/**
 * Simple wave-file parser.
 * It is only capable of parsing the fmt and the data subchunks. All other data will be discarded.
 * @see http://soundfile.sapp.org/doc/WaveFormat/
 */

export interface WaveFile {
    chunkId: 'RIFF';
    chunkSize: number;
    format: 'WAVE';
    subchunks: {
        [key: string]: Subchunk;
        fmt: Subchunk<SubchunkDataFmt>;
        data: Subchunk<SubchunkDataData>;
    }
}

export type Subchunk<T extends SubchunkDataTypes = {}> = {
    subchunkId: string;
    subchunkSize: number;
    subchunkData: T;
}

export type SubchunkDataTypes = SubchunkDataFmt | SubchunkDataData | {};

export interface SubchunkDataFmt {
    audioFormat: number;
    numChannels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
}

export interface SubchunkDataData {
    samples: ArrayBuffer;
}

const SubchunkDataFmtParser = new Parser()
    .endianess('little')
    .uint16('audioFormat')
    .uint16('numChannels')
    .uint32('sampleRate')
    .uint32('byteRate')
    .uint16('blockAlign')
    .uint16('bitsPerSample')
    .seek(function(){
        return this.$parent.subchunkSize - 16;
    })

const SubchunkDataDataParser = new Parser()
    .buffer('samples', {
        length: function(){ return this.$parent.subchunkSize; }
    })

const SubchunkDataNullParser = new Parser()
    .seek(function(){
        return this.$parent.subchunkSize;
    })

const SubchunkParser = new Parser()
    .endianess('little')
    .string('subchunkId', {
        length: 4,
        encoding: 'ascii',
    })
    .uint32('subchunkSize')
    .choice('subchunkData', {
        tag(){ return ['fmt ', 'data'].indexOf(this.subchunkId) },
        choices: {
            0: SubchunkDataFmtParser,
            1: SubchunkDataDataParser,
        },
        defaultChoice: SubchunkDataNullParser,
    })

const WaveParser = new Parser()
    .useContextVars()
    .endianess('little')
    .string('chunkId', {
        length: 4,
        encoding: 'ascii',
        assert: val => val === 'RIFF'
    })
    .uint32('chunkSize')
    .string('format', {
        length: 4,
        encoding: 'ascii',
        assert: val => val === 'WAVE'
    })
    .array('subchunks', {
        type: SubchunkParser,
        readUntil: 'eof',
        formatter(val: Subchunk[]){
            const object = {};
            val.forEach(subchunk => object[subchunk.subchunkId.trim()] = subchunk);
            return object;
        }
    })

WaveParser.compile();

export default WaveParser;
