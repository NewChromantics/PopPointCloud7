import {GetNextPowerOf2,CreateTranslationMatrix,Add3,Multiply3,Dot3,lerp,Lerp,LengthSq3,Normalise3,Subtract3} from './PopEngine/Math.js'
import DirtyBuffer from './PopEngine/DirtyBuffer.js'
import Pop from './PopEngine/PopEngine.js'

const BEHAVIOUR_STATIC = 0;
const BEHAVIOUR_DEBRIS = 1;
const BEHAVIOUR_SHAPE = 2;



export default class VoxelBuffer_t
{
	constructor()
	{
		//	base shape we're conforming to
		this.ShapePositionsTexture = null;
		this.Colours = null;
		
		//	live data
		this.PositionsTexture = null;
		this.PreviousPositionsTexture = null;
		this.VelocitysTexture = null;
		this.PreviousVelocitysTexture = null;
		
		this.VoxelsUsed = 0;
	}
	
	AddVoxel(Position,Velocity,Colour,ModelPosition)
	{
		//	pad to 4
		let Random = Math.random();
		let BehaviourType = BEHAVIOUR_DEBRIS;
		Position = [...Position,Random].slice(0,4);
		Velocity = [...Velocity,BehaviourType].slice(0,4);
		ModelPosition = ModelPosition || Position;
		this.AddVoxels( Position, Velocity, Colour, ModelPosition );
	}
	
	AddVoxels(Positions,Velocitys,Colours,ModelPositions)
	{
		if ( !ModelPositions )
			ModelPositions = Positions;
		
		const VoxelCount = Positions.length/4;
		
		if ( !this.PositionsTexture )
			this.AllocVoxels( VoxelCount );
			
		const w = this.PositionsTexture.GetWidth();
		const h = this.PositionsTexture.GetHeight();
			
		//	write into each buffer/texture
		//	todo; part update textures
		this.PositionsBuffer.set( Positions, this.VoxelsUsed*4 );
		this.VelocitysBuffer.set( Velocitys, this.VoxelsUsed*4 );
		this.ShapePositionsBuffer.set( Positions, this.VoxelsUsed*4 );
		
		this.ShapePositionsTexture.WritePixels( w, h, this.ShapePositionsBuffer, 'Float4' );
		this.PositionsTexture.WritePixels( w, h, this.PositionsBuffer, 'Float4' );
		this.VelocitysTexture.WritePixels( w, h, this.VelocitysBuffer, 'Float4' );
		
		//	do we NEED to do this? may want something to mark as new
		//this.PreviousPositionsTexture.WritePixels( w, h, this.PositionsBuffer, 'Float4' );
		//this.PreviousVelocitysTexture.WritePixels( w, h, this.VelocitysBuffer, 'Float4' );
		
		if ( Array.isArray(Colours) )
			Colours = new Float32Array(Colours.flat(2));
		
		this.Colours.push( Colours );
		this.VoxelsUsed += VoxelCount;
	}
	
	AllocVoxels(PositionCount)
	{
		let w = GetNextPowerOf2(Math.floor( Math.sqrt(PositionCount) ));
		let h = w;//	this could reduce until w*h < cubecount
		let BufferCount = w*h;

		const Zero4s = new Float32Array(4*BufferCount).fill(0);

		//	this buffer dicates instance count
		this.Colours = new DirtyBuffer();
		
		
		//	because we're update different textures
		//	we need a buffer per texture otherwise they wont all get changes
		//	we may ditch this for reading back data
		//	or maybe we can just mark prev data as New
		this.PositionsBuffer = new DirtyBuffer( new Float32Array(w*h*4) );
		this.VelocitysBuffer = new DirtyBuffer( new Float32Array(w*h*4) );
		this.ShapePositionsBuffer = new DirtyBuffer( new Float32Array(w*h*4) );
		
		
		this.PreviousPositionsTexture = new Pop.Image('PreviousPositionsTexture');
		this.PreviousPositionsTexture.WritePixels( w, h, Zero4s, 'Float4' );
		this.PositionsTexture = new Pop.Image('PositionsTexture');
		this.PositionsTexture.WritePixels( w, h, Zero4s, 'Float4' );
		this.ShapePositionsTexture = new Pop.Image('ShapePositionsTexture');
		this.ShapePositionsTexture.WritePixels( w, h, Zero4s, 'Float4' );
		this.VelocitysTexture = new Pop.Image('VelocitysTexture');
		this.VelocitysTexture.WritePixels( w, h, Zero4s, 'Float4' );
		this.PreviousVelocitysTexture = new Pop.Image('PreviousVelocitysTexture');
		this.PreviousVelocitysTexture.WritePixels( w, h, Zero4s, 'Float4' );
		
	}
	
	LoadPositions(Positions,Colours=null,CenterPosition=[0,0,0],InitialVelocityScale=0)
	{
		function GetShapePositon4(Position,Index)
		{
			let xyz = Position.slice(0,3);
			xyz = Add3( xyz, CenterPosition );
			//	we'll use w as a random value per voxel
			let Random = Math.random();
			return [...xyz,Random];
		}

		function GetInitialVelocity4(Position,Index)
		{
			let Scale = Math.random();
			//	make it less frequent for a high-speed fling
			Scale = Scale * Scale * Scale * Scale * Scale;
			
			Scale *= InitialVelocityScale;
			let x = Math.random()-0.5;
			let y = Math.random()-0.5;
			let z = Math.random()-0.5;
			let BehaviourType = BEHAVIOUR_SHAPE;
			return [x*Scale,y*Scale,z*Scale,BehaviourType];
		}
			
		let Position4s = Positions.map( GetShapePositon4 );
		Position4s = Position4s.flat(2);

		let Velocity4s = Positions.map( GetInitialVelocity4 );
		Velocity4s = Velocity4s.flat(2);
		
		if ( !Colours )
			Colours = Positions.map( GetRandomColour );
		
		this.AddVoxels( Position4s, Velocity4s, Colours );
	}
}

