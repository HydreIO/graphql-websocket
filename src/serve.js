import Executor from '@hydre/graphql-batch-executor'
import Future from 'folktale/concurrency/future/index.js'
import object_buffer from './object_buffer.js'
import stream from 'stream'
import { promisify } from 'util'

const pipeline = promisify(stream.pipeline)
const { fromPromise } = Future
const consume_channel = execute => channel =>
  fromPromise(channel.read())
      .map(array => array.buffer)
      .map(object_buffer.rtl)
      .map(execute)
      .toPromise()

export default graphql_options => ({
  socket,
  request,
  context,
}) => {
  const executor = new Executor({
    ...graphql_options,
    context: {
      ...context,
      request,
    },
  })
  const consume = consume_channel(executor.execute.bind(executor))

  socket.on('channel', async channel => {
    const through = await consume(channel)

    channel.cleanup(() => {
      through.end()
    })

    await pipeline(
        through,
        async function *(source) {
          for await (const chunk of source)
            yield new Uint8Array(object_buffer.ltr(chunk))
        },
        channel.writable.bind(channel),
    )
  })
}
