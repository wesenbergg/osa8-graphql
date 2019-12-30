require('dotenv').config()

const { ApolloServer, UserInputError, gql } = require('apollo-server')
const jwt = require('jsonwebtoken')
const uuid = require('uuid/v1')

const mongoose = require('mongoose')
const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')

mongoose.set('useFindAndModify', false)

const MONGODB_URI = process.env.DB_URI
const JWT_SECRET = process.env.TOKEN_SECRET

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI, { useNewUrlParser: true })
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = gql`
  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }

  type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type Query {
    hello: String!
    me: User
    bookCount: Int!
    authorCount: Int!
    allAuthors: [Author!]!
    allBooks(author: String, genre: String): [Book]!
    allUsers: [User!]!
  }

  type Mutation {
    addBook(
    title: String!
    published: Int!
    author: String!
    genres: [String!]!
    ): Book
    editAuthor(
    name: String!,
    born: Int!
    ): Author
    createUser(
      username: String!
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }
`


const resolvers = {
  Mutation: {
    //args: username favgenre
    createUser: (root, args) => {
      console.log(args)
      const user = new User({ ...args })
      console.log(user)
      return user.save()
      .catch(error => {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        })
      })
    },
    //args: username, password
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })

      if ( !user || args.password !== process.env.PASSWORD )
        throw new UserInputError("wrong credentials")

      const userForToken = {
        username: user.username,
        id: user._id,
      }

      return { value: jwt.sign(userForToken, JWT_SECRET) }
    },
    addBook: async (root, args, context) => {
      console.log('saidbiasubd')
      try{
        let foundAuthor = await Author.findOne({ name: args.author })
        console.log(foundAuthor)
        if( !context.currentUser ) return null
        if( !foundAuthor ){
          foundAuthor = new Author({ name: args.author, bookCount: 1 })
          await foundAuthor.save()
        }

        const newBook = new Book({ ...args, author: foundAuthor.id })
      
        await newBook.save()
        return newBook
      }catch(error){
        throw new UserInputError(error.message, { invalidArgs: args })
      }
    },
    editAuthor: async (root, args, context) => {
      const foundAuthor = await Author.findOne({ name: args.name })

      if(!foundAuthor || !context.currentUser) return null
      
      try{
        foundAuthor.born = args.born
        await foundAuthor.save()
      }catch(error){
        throw new UserInputError(error.message, { invalidArgs: args })
      }

      return foundAuthor
    }
  },

  Query: {
    hello: () => "world",
    me: (root, args, context) => context.currentUser,
    bookCount: () => Book.collection.countDocuments(),
    authorCount: () => Author.collection.countDocuments(),
    allAuthors: () => Author.find({}),
    allUsers:() => User.find({}),
    allBooks: async (root, args) => {
        let foundAuthor = args.author ? await Author.findOne({ name: args.author }): null
        let quriedBooks = foundAuthor ? await Book.find({ author: { $in: foundAuthor.id } }).populate('author'): await Book.find({}).populate('author')
        return args.genre ? quriedBooks.filter(b => b.genres.includes(args.genre)): quriedBooks
    }
  },

  Author: {
    bookCount: async (root) => await (await Book.find({ author: { $in: root.id }})).length
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    //console.log(req.headers.authorization)
    const auth = req ? req.headers.authorization : null
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7), JWT_SECRET
      )
      const currentUser = await User.findById(decodedToken.id)
      //console.log(currentUser.username)
      return { currentUser }
    }
  }
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})